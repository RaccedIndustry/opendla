import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  // Daily RFQ import: fetch the zip → unzipSync (fflate) → parse → save to SQLite.
  @Cron(CronExpression.EVERY_DAY_AT_1AM, { name: 'ingest' })
  run() {
    this.logger.log('Daily ingest: not implemented yet');
  }
}
