import { DataSource, type DataSourceOptions } from 'typeorm';
import { User } from './auth/user.entity.js';
import { Archive } from './ingest/archive.entity.js';
import { Init1793128027365 } from './migrations/1793128027365-Init.js';
import {
  ApprovedSource,
  AwardHistory,
  Line,
  Solicitation,
} from './solicitations/solicitation.entity.js';

/** The one database config, shared by the app, the typeorm CLI (default export) and the tests. */
export const options = {
  type: 'better-sqlite3',
  database: process.env.DB_PATH || 'data/rfqcrm.sqlite',
  // Listed, not globbed: TypeORM's glob loader bypasses vitest and resolves against the cwd.
  entities: [User, Archive, Solicitation, Line, ApprovedSource, AwardHistory],
  // ponytail: TypeORM 1.1.2's undoLastMigration BEGINs before its FK-off pragma, so reverting a migration that
  // rebuilds a parent table cascade-deletes its child rows; wrap it in PRAGMA foreign_keys OFF/ON, with a test,
  // in the change that adds the second migration.
  migrations: [Init1793128027365],
  migrationsRun: true,
} satisfies DataSourceOptions;

export default new DataSource(options);
