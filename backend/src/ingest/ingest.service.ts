import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { PARSER_VERSION, parseRfq } from '../parser/parse.js';
import {
  type RfqJson,
  Solicitation,
  storeRfq,
} from '../solicitations/solicitation.entity.js';
import { Archive } from './archive.entity.js';
import {
  dibbsGet,
  type IndexRow,
  indexRows,
  listArchives,
  RFQ_DATES_URL,
} from './dibbs.js';

const ARCHIVE_DIR = 'data/archive'; // next to data/rfqcrm.sqlite
const execFileAsync = promisify(execFile);

/** A day's folder: ca261022.zip → data/archive/ca261022, which holds its PDFs and its index in261022.txt. */
const folder = (fileUrl: string) =>
  join(ARCHIVE_DIR, basename(new URL(fileUrl).pathname, '.zip'));
const indexFile = (dir: string) =>
  join(dir, `${basename(dir).replace(/^ca/, 'in')}.txt`);

/** Streams a DIBBS file to disk. DIBBS answers a missing file with an HTML page. */
async function save(url: string, path: string) {
  const res = await dibbsGet(url);
  if (
    !res.ok ||
    !res.body ||
    res.headers.get('content-type')?.includes('text/html')
  ) {
    throw new Error(`${basename(path)} is not on DIBBS (HTTP ${res.status})`);
  }
  await writeFile(path, res.body); // streamed, never held in memory
}

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private running?: Promise<void>;
  /** The last look at DIBBS's dates page, shown in the UI: a vendor whose IP DIBBS blocks must find out. */
  lastCheck?: { at: string; error?: string };

  constructor(
    @InjectRepository(Archive) private readonly archives: Repository<Archive>,
  ) {}

  // DIBBS builds a day's archive just after midnight ET the next day.
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'ingest',
    timeZone: 'America/New_York',
  })
  run(): Promise<void> {
    // One run at a time: the cron and a manual trigger must not download the same file twice.
    this.running ??= this.ingest().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async ingest() {
    try {
      await this.discover();
      this.lastCheck = { at: new Date().toISOString() };
    } catch (err) {
      // Days already on disk still get parsed while DIBBS is unreachable.
      this.lastCheck = { at: new Date().toISOString(), error: message(err) };
      this.logger.error(`DIBBS check failed: ${message(err)}`);
    }
    const days = (state: Archive['state']) =>
      this.archives.find({
        where: { state, demo: false },
        order: { date: 'ASC' },
      });
    for (const archive of await days('pending')) {
      try {
        await this.download(archive.fileUrl);
        await this.archives.update(archive.id, {
          state: 'downloaded',
          errors: null,
        });
        this.logger.log(`Downloaded ${archive.fileUrl}`);
      } catch (err) {
        // Stays pending, so the next run retries it.
        const file = basename(archive.fileUrl);
        await this.archives.update(archive.id, {
          errors: [{ file, error: message(err) }],
        });
        this.logger.error(`${file}: ${message(err)}`);
      }
    }
    for (const archive of await days('downloaded')) {
      try {
        await this.parse(archive);
      } catch (err) {
        // Stays downloaded, so the next run retries it.
        const file = basename(folder(archive.fileUrl));
        await this.archives.update(archive.id, {
          errors: [{ file, error: message(err) }],
        });
        this.logger.error(`${file}: ${message(err)}`);
      }
    }
  }

  /** The archives DIBBS lists right now (about the last month), newest first. */
  async listed() {
    const page = await dibbsGet(RFQ_DATES_URL);
    return listArchives(await page.text());
  }

  /** Queue the archives DIBBS lists that are newer than the newest one we have. */
  private async discover() {
    const listed = await this.listed();
    if (!listed.length)
      throw new Error('no archives found on the DIBBS dates page');
    // Pending and demo rows don't count: a hand-added future date must not hide the days
    // before it, and the demo must not pass for a download.
    const [newest] = await this.archives.find({
      where: { state: Not('pending'), demo: false },
      order: { date: 'DESC' },
      take: 1,
    });
    // Nothing downloaded yet: take only the newest file, not DIBBS's whole month (~20 GB).
    const fresh = newest
      ? listed.filter((a) => a.date > newest.date)
      : listed.slice(0, 1);
    if (fresh.length) {
      // Dates are unique, so a real day replaces its demo row (and the demo RFQs).
      await this.archives.delete({
        demo: true,
        date: In(fresh.map((a) => a.date)),
      });
      await this.archives
        .createQueryBuilder()
        .insert()
        .values(fresh)
        .orIgnore()
        .execute();
    }
  }

  /** ca261022.zip → data/archive/ca261022/*.pdf, plus the day's index in261022.txt. */
  private async download(fileUrl: string) {
    const dir = folder(fileUrl);
    await mkdir(dir, { recursive: true });
    // The small index first, from next to the zip: without it the day stays pending (and is retried)
    // before 1.4 GB of PDFs are fetched for nothing.
    await save(fileUrl.replace(/ca(\d{6})\.zip$/i, 'in$1.txt'), indexFile(dir));
    await save(fileUrl, `${dir}.zip`);
    // System unzip reads the central directory; fflate's streaming Unzip can split
    // entries on stray PK bytes in these data-descriptor zips.
    // ponytail: the PDFs are kept (~1.4 GB/day) so a day can be parsed again; prune old folders by age if disk matters
    await execFileAsync('unzip', ['-qo', `${dir}.zip`, '-d', dir]);
    await rm(`${dir}.zip`);
  }

  /**
   * Parses a downloaded day into solicitations, one PDF at a time. A PDF that fails is listed in the
   * day's errors instead of failing the day. Safe to repeat: each RFQ is replaced in its own
   * transaction, so a PDF that fails now keeps what an earlier parse stored (and the awards it holds).
   */
  async parse(archive: Archive) {
    const dir = folder(archive.fileUrl);
    const files = (await readdir(dir, { recursive: true }))
      .filter((f) => /\.pdf$/i.test(f))
      .sort();
    if (!files.length) throw new Error(`no PDFs in ${dir}`);
    const errors: { file: string; error: string }[] = [];
    const index = await readFile(indexFile(dir), 'latin1')
      .then(indexRows)
      .catch(() => new Map<string, IndexRow>());
    // Missing, or in a layout indexRows() doesn't know: say so once instead of failing silently.
    if (!index.size)
      errors.push({
        file: basename(indexFile(dir)),
        error:
          'missing or in an unknown layout: due dates come from the PDFs, set-aside and AMSC are blank',
      });
    // ponytail: parses on the main thread, one page at a time; move parseRfq (bytes in, JSON out) into a worker if the UI stalls
    for (const file of files) {
      try {
        const bytes = await readFile(join(dir, file));
        const data = (await parseRfq(bytes, basename(file))) as RfqJson;
        const row = index.get(data.solicitation.number.replaceAll('-', ''));
        if (!row && index.size)
          errors.push({
            file,
            error:
              'not in the daily index: due date from the PDF, no set-aside or AMSC',
          });
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        await this.archives.manager.transaction(async (em) => {
          await em.delete(Solicitation, {
            archiveId: archive.id,
            number: data.solicitation.number,
          });
          await storeRfq(em, archive.id, data, row, {
            sha256,
            parserVersion: PARSER_VERSION,
          });
        });
      } catch (err) {
        errors.push({ file, error: message(err) });
      }
    }
    await this.archives.update(archive.id, {
      state: 'parsed',
      errors: errors.length ? errors : null,
    });
    this.logger.log(
      `Parsed ${archive.date}: ${files.length} PDFs, ${errors.length} errors`,
    );
  }
}
