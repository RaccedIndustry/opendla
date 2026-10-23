import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Archive } from './archive.entity.js';
import { dibbsGet, listArchives, RFQ_DATES_URL } from './dibbs.js';

const ARCHIVE_DIR = 'data/archive'; // next to data/rfqcrm.sqlite
const execFileAsync = promisify(execFile);

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private running?: Promise<void>;

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
    await this.discover();
    const pending = await this.archives.find({
      where: { state: 'pending', demo: false },
      order: { date: 'ASC' },
    });
    for (const archive of pending) {
      try {
        await this.download(archive.fileUrl);
        await this.archives.update(archive.id, { state: 'downloaded' });
        this.logger.log(`Downloaded ${archive.fileUrl}`);
      } catch (err) {
        // Stays pending, so the next run retries it.
        this.logger.error(`${archive.fileUrl}: ${String(err)}`);
      }
    }
    // Next step: parse each downloaded day's PDFs, then state → 'parsed'.
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
      this.logger.warn('No archives found on the DIBBS dates page');
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

  /** ca261022.zip → data/archive/ca261022/*.pdf; the zip is deleted afterwards. */
  private async download(fileUrl: string) {
    const res = await dibbsGet(fileUrl);
    if (
      !res.ok ||
      !res.body ||
      res.headers.get('content-type')?.includes('text/html')
    ) {
      throw new Error(`no zip (HTTP ${res.status})`);
    }
    const name = basename(new URL(fileUrl).pathname, '.zip');
    const zip = join(ARCHIVE_DIR, `${name}.zip`);
    await mkdir(ARCHIVE_DIR, { recursive: true });
    await writeFile(zip, res.body); // streamed to disk, never held in memory
    // System unzip reads the central directory; fflate's streaming Unzip can split
    // entries on stray PK bytes in these data-descriptor zips.
    // ponytail: PDFs pile up ~1.4 GB/day; delete a day's folder once it's parsed
    await execFileAsync('unzip', ['-qo', zip, '-d', join(ARCHIVE_DIR, name)]);
    await rm(zip);
  }
}
