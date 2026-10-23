import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IngestService } from './ingest/ingest.service.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/rfqcrm.sqlite',
      autoLoadEntities: true,
      // ponytail: schema auto-sync drops and re-adds renamed columns (data lost); switch to migrations once data matters
      synchronize: true,
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService, IngestService],
})
export class AppModule {}
