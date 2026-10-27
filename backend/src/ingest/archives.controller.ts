import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Archive } from './archive.entity.js';
import { IngestService } from './ingest.service.js';

@Controller('archives')
export class ArchivesController {
  private readonly logger = new Logger(ArchivesController.name);

  constructor(
    @InjectRepository(Archive) private readonly archives: Repository<Archive>,
    private readonly ingest: IngestService,
  ) {}

  // ponytail: every row (~300 a year); add paging if that ever hurts
  @Get()
  list() {
    return this.archives.find({ order: { date: 'DESC' } });
  }

  /** When the job last looked at DIBBS's dates page and whether that worked; null until the first run. */
  @Get('status')
  status() {
    return { lastCheck: this.ingest.lastCheck ?? null };
  }

  /** Queue a day the job skipped. The URL comes from DIBBS's own list, so a day it never posted can't sit in pending forever. */
  @Post()
  async add(@Body('date') date: unknown) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new BadRequestException('date must be YYYY-MM-DD');
    if (await this.archives.existsBy({ date, demo: false }))
      throw new ConflictException(`${date} is already in the list`);
    const listed = await this.ingest.listed();
    const found = listed.find((a) => a.date === date);
    if (!found) {
      const range = listed.length
        ? ` It lists ${listed.at(-1)?.date} to ${listed[0].date}.`
        : '';
      throw new BadRequestException(
        `DIBBS has no archive for ${date}.${range}`,
      );
    }
    // Dates are unique, so the real day replaces its demo row (and the demo RFQs).
    await this.archives.delete({ date, demo: true });
    return this.archives.save(found);
  }

  @Patch(':id')
  async setState(
    @Param('id', ParseIntPipe) id: number,
    @Body('state', new ParseEnumPipe(['pending', 'downloaded', 'parsed']))
    state: Archive['state'],
  ) {
    const { affected } = await this.archives.update(id, { state });
    if (!affected) throw new NotFoundException();
  }

  /** Starts the daily job and answers at once; a download takes minutes and the job logs its own progress. */
  @Post('run')
  @HttpCode(202)
  run() {
    // The catch keeps a failed run (e.g. DIBBS down) from becoming an unhandled rejection that kills the server.
    this.ingest
      .run()
      .catch((err) => this.logger.error(`Manual run failed: ${String(err)}`));
  }
}
