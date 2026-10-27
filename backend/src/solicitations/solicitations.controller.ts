import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { folder } from '../ingest/ingest.service.js';
import { AwardHistory, Line, Solicitation } from './solicitation.entity.js';

/** What the lines filter on: query param → column. Only these names reach the SQL; values are always bound. */
const FILTERS: Record<string, string> = {
  quoteDueDate: 's.quoteDueDate',
  setAside: 's.setAside',
  controlled: 's.controlled',
  firstArticle: 's.firstArticle',
  office: 's.office',
};
/** The booleans among them: true/false in the URL, 0/1 in SQLite. */
const FLAGS = ['controlled', 'firstArticle'];

@Controller()
export class SolicitationsController {
  constructor(
    @InjectRepository(Solicitation)
    private readonly solicitations: Repository<Solicitation>,
  ) {}

  /**
   * One page of a day's lines (CLINs), each with its RFQ, approved-source CAGEs and the latest award on record
   * for the NSN, plus how many lines match and each filter's values. `q` searches every text value in the
   * RFQs' JSON, each FILTERS param keeps the lines whose column equals it, and `page` (from 1) and `size`
   * pick the page.
   */
  @Get('archives/:archiveId/lines')
  async lines(
    @Param('archiveId', ParseIntPipe) archiveId: number,
    @Query() query: Record<string, unknown>,
  ) {
    const one = (key: string) => {
      const v = query[key];
      // Express turns ?q=a&q=b into an array.
      if (v !== undefined && typeof v !== 'string') {
        throw new BadRequestException(`${key} must be a single value`);
      }
      return v;
    };
    const positive = (key: string, fallback: number) => {
      const v = one(key) ?? String(fallback);
      // Up to 9 digits, so LIMIT and OFFSET stay integers.
      if (!/^[1-9]\d{0,8}$/.test(v)) {
        throw new BadRequestException(`${key} must be a positive whole number`);
      }
      return Number(v);
    };
    const size = positive('size', 25); // the table's default
    const page = positive('page', 1);
    const term = one('q')?.trim();
    const filters = Object.entries(FILTERS).flatMap(([key, column]) => {
      const v = one(key);
      if (v === undefined) return [];
      const flag = FLAGS.includes(key);
      if (flag && v !== 'true' && v !== 'false') {
        throw new BadRequestException(`${key} must be true or false`);
      }
      return [{ column, v: flag ? Number(v === 'true') : v }];
    });

    let where = 's.archiveId = ?';
    const args: unknown[] = [archiveId];
    if (term) {
      // Values only, so key names like "nsn" or "fob" don't match every row. Scanned once: the queries
      // below reuse the matching ids.
      // ponytail: scans the day's JSON (~300 ms for 3.3k RFQs) on every page or filter change; FTS5 if that hurts or search across days is needed
      const ids: { id: number }[] = await this.solicitations.query(
        `SELECT id FROM solicitation s WHERE archiveId = ?
           AND EXISTS (SELECT 1 FROM json_tree(s.data) WHERE type = 'text' AND value LIKE ? ESCAPE '\\')`,
        [archiveId, `%${term.replace(/[\\%_]/g, '\\$&')}%`],
      );
      where += ' AND s.id IN (SELECT value FROM json_each(?))';
      args.push(JSON.stringify(ids.map((r) => r.id)));
    }
    const from = 'FROM line l JOIN solicitation s ON s.id = l.solicitationId';

    // Each filter's values come from the day and the search but not the other filters, so picking one hides none.
    const combos: Record<string, string | number | null>[] =
      await this.solicitations.query(
        `SELECT DISTINCT ${Object.entries(FILTERS)
          .map(([key, column]) => `${column} AS ${key}`)
          .join(', ')} ${from} WHERE ${where}`,
        args,
      );
    const options = Object.fromEntries(
      Object.keys(FILTERS).map((key) => {
        const values = [...new Set(combos.map((r) => r[key]))]
          .filter((v) => v !== null)
          .sort((a, b) => (String(a) < String(b) ? -1 : 1));
        return [key, FLAGS.includes(key) ? values.map(Boolean) : values];
      }),
    );

    for (const { column, v } of filters) {
      where += ` AND ${column} = ?`;
      args.push(v);
    }
    const [{ total }]: { total: number }[] = await this.solicitations.query(
      `SELECT COUNT(*) AS total ${from} WHERE ${where}`,
      args,
    );
    // A page past the end, e.g. from an old link, shows the last one, as the table does.
    const last = Math.max(1, Math.ceil(total / size));
    const rows: Record<string, unknown>[] = await this.solicitations.query(
      `SELECT l.id, s.id AS solicitationId, s.number, l.clin, l.nomenclature, l.nsn, l.quantity, l.unit,
              s.quoteDueDate, l.deliveryDays, s.setAside, s.amsc, s.controlled, s.firstArticle,
              s.office, s.buyer, l.fob,
              (SELECT replace(group_concat(DISTINCT a.cage), ',', ' ') FROM approved_source a WHERE a.lineId = l.id) AS cages,
              h.unitPrice AS lastPrice, h.quantity AS lastQuantity, h.cage AS lastCage,
              h.awardDate AS lastAwardDate, h.surplus AS lastSurplus
       ${from}
       LEFT JOIN award_history h ON h.id = (
         SELECT id FROM award_history WHERE nsn = l.nsn ORDER BY awardDate DESC, id DESC LIMIT 1)
       WHERE ${where}
       ORDER BY s.quoteDueDate, s.number, l.clin
       LIMIT ? OFFSET ?`,
      [...args, size, (Math.min(page, last) - 1) * size],
    );
    return {
      total,
      // SQLite hands booleans back as 0/1.
      rows: rows.map((r) => ({
        ...r,
        controlled: !!r.controlled,
        firstArticle: !!r.firstArticle,
        lastSurplus: r.lastSurplus === null ? null : !!r.lastSurplus,
      })),
      options,
    };
  }

  /** One RFQ with its parsed JSON and every award on record for its NSNs, newest first. */
  @Get('solicitations/:id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const solicitation = await this.solicitations
      .createQueryBuilder('s')
      .addSelect('s.data')
      .where('s.id = :id', { id })
      .getOne();
    if (!solicitation) throw new NotFoundException();
    const em = this.solicitations.manager;
    const nsns = (await em.findBy(Line, { solicitationId: id }))
      .map((l) => l.nsn)
      .filter((nsn) => nsn !== null);
    const awards = await em.find(AwardHistory, {
      where: { nsn: In(nsns) },
      order: { awardDate: 'DESC', id: 'DESC' },
    });
    return Object.assign(solicitation, { awards });
  }

  /** The PDF DIBBS posted for the RFQ, from its day's folder. */
  @Get('solicitations/:id/pdf')
  async pdf(@Param('id', ParseIntPipe) id: number) {
    const [row]: { file: string | null; fileUrl: string }[] =
      await this.solicitations.query(
        `SELECT json_extract(s.data, '$.source_file') AS file, a.fileUrl
         FROM solicitation s JOIN archive a ON a.id = s.archiveId WHERE s.id = ?`,
        [id],
      );
    if (!row?.file) throw new NotFoundException();
    // A bare file name (the parser gets basename(file)), so it can't leave the folder.
    const bytes = await readFile(join(folder(row.fileUrl), row.file)).catch(
      (err: NodeJS.ErrnoException) => {
        // A demo day has no folder; a pruned day has none left.
        throw err.code === 'ENOENT'
          ? new NotFoundException('The PDF is not on this server')
          : err;
      },
    );
    return new StreamableFile(bytes, { type: 'application/pdf' });
  }
}
