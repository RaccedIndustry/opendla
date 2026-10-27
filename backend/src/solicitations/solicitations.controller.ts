import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AwardHistory, Line, Solicitation } from './solicitation.entity.js';

@Controller()
export class SolicitationsController {
  constructor(
    @InjectRepository(Solicitation)
    private readonly solicitations: Repository<Solicitation>,
  ) {}

  /**
   * A day's lines (CLINs) with their RFQ, approved-source CAGEs and the latest award on record for the NSN.
   * `q` searches every text value in the RFQs' JSON.
   */
  @Get('archives/:archiveId/lines')
  async lines(
    @Param('archiveId', ParseIntPipe) archiveId: number,
    @Query('q') q: unknown,
  ) {
    // Express turns ?q=a&q=b into an array.
    if (q !== undefined && typeof q !== 'string') {
      throw new BadRequestException('q must be a single string');
    }
    const term = q?.trim();
    // Values only, so key names like "nsn" or "fob" don't match every row.
    // ponytail: scans the day's JSON (~250 ms for 3.3k RFQs); FTS5 if search across days is needed
    const search = term
      ? `AND EXISTS (SELECT 1 FROM json_tree(s.data) WHERE type = 'text' AND value LIKE ? ESCAPE '\\')`
      : '';
    const rows: Record<string, unknown>[] = await this.solicitations.query(
      `SELECT l.id, s.id AS solicitationId, s.number, l.clin, l.nomenclature, l.nsn, l.quantity, l.unit,
              s.quoteDueDate, l.deliveryDays, s.setAside, s.amsc, s.controlled, s.firstArticle,
              s.office, s.buyer, l.fob,
              (SELECT replace(group_concat(DISTINCT a.cage), ',', ' ') FROM approved_source a WHERE a.lineId = l.id) AS cages,
              h.unitPrice AS lastPrice, h.quantity AS lastQuantity, h.cage AS lastCage,
              h.awardDate AS lastAwardDate, h.surplus AS lastSurplus
       FROM line l
       JOIN solicitation s ON s.id = l.solicitationId
       LEFT JOIN award_history h ON h.id = (
         SELECT id FROM award_history WHERE nsn = l.nsn ORDER BY awardDate DESC, id DESC LIMIT 1)
       WHERE s.archiveId = ? ${search}
       ORDER BY s.quoteDueDate, s.number, l.clin`,
      term ? [archiveId, `%${term.replace(/[\\%_]/g, '\\$&')}%`] : [archiveId],
    );
    // SQLite hands booleans back as 0/1.
    return rows.map((r) => ({
      ...r,
      controlled: !!r.controlled,
      firstArticle: !!r.firstArticle,
      lastSurplus: r.lastSurplus === null ? null : !!r.lastSurplus,
    }));
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
}
