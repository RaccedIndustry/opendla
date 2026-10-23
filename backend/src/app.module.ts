import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { User } from './auth/user.entity.js';
import { Archive } from './ingest/archive.entity.js';
import { IngestService } from './ingest/ingest.service.js';

// Kept next to the DB so restarts (incl. watch mode) don't log everyone out.
function jwtSecret() {
  const file = 'data/jwt.secret';
  if (!existsSync(file)) {
    mkdirSync('data', { recursive: true });
    writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return readFileSync(file, 'utf8');
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/rfqcrm.sqlite',
      autoLoadEntities: true,
      // ponytail: schema auto-sync drops and re-adds renamed columns (data lost); switch to migrations once data matters
      synchronize: true,
    }),
    TypeOrmModule.forFeature([User, Archive]),
    JwtModule.register({ secret: jwtSecret() }),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController, AuthController],
  providers: [
    AppService,
    IngestService,
    AuthService,
    // Every route needs a login unless marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
