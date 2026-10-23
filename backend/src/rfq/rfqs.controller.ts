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
import { Repository } from 'typeorm';
import { Rfq } from './rfq.entity.js';

@Controller()
export class RfqsController {
  constructor(@InjectRepository(Rfq) private readonly rfqs: Repository<Rfq>) {}

  /** The RFQs of one archive. `q` searches every text value in their JSON. */
  @Get('archives/:archiveId/rfqs')
  list(
    @Param('archiveId', ParseIntPipe) archiveId: number,
    @Query('q') q: unknown,
  ) {
    // Express turns ?q=a&q=b into an array.
    if (q !== undefined && typeof q !== 'string') {
      throw new BadRequestException('q must be a single string');
    }
    const query = this.rfqs
      .createQueryBuilder('r')
      .where('r.archiveId = :archiveId', { archiveId })
      .orderBy('r.quoteDueDate')
      .addOrderBy('r.number');
    const term = q?.trim();
    if (term) {
      // Values only, so key names like "nsn" or "fob" don't match every row.
      // ponytail: scans the archive's JSON (~250 ms for 3.3k RFQs); FTS5 if search across archives is needed
      query.andWhere(
        "EXISTS (SELECT 1 FROM json_tree(r.data) WHERE type = 'text' AND value LIKE :q ESCAPE '\\')",
        { q: `%${term.replace(/[\\%_]/g, '\\$&')}%` },
      );
    }
    return query.getMany();
  }

  @Get('rfqs/:id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const rfq = await this.rfqs
      .createQueryBuilder('r')
      .addSelect('r.data')
      .where('r.id = :id', { id })
      .getOne();
    if (!rfq) throw new NotFoundException();
    return rfq;
  }
}
