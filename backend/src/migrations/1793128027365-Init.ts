import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1793128027365 implements MigrationInterface {
  name = 'Init1793128027365';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar NOT NULL, "passwordHash" varchar NOT NULL, CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "archive" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "date" date NOT NULL, "fileUrl" varchar NOT NULL, "state" varchar CHECK( "state" IN ('pending','downloaded','parsed') ) NOT NULL DEFAULT ('pending'), "demo" boolean NOT NULL DEFAULT (0), "errors" text, CONSTRAINT "UQ_e3cc1b5400563141c4a461d0760" UNIQUE ("date"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "solicitation" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "archiveId" integer NOT NULL, "number" varchar NOT NULL, "type" varchar NOT NULL, "issueDate" date, "quoteDueDate" date, "office" varchar, "buyer" varchar, "buyerCode" varchar, "setAside" varchar, "amsc" varchar, "firstArticle" boolean NOT NULL, "controlled" boolean NOT NULL, "sha256" varchar, "parserVersion" integer NOT NULL, "data" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4196bbc1025ff0166ab5f72161" ON "solicitation" ("archiveId", "number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "line" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "solicitationId" integer NOT NULL, "clin" varchar NOT NULL, "nsn" varchar, "nomenclature" varchar, "quantity" real, "unit" varchar, "deliveryDays" integer, "fob" varchar, "purchaseRequest" varchar)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_948dc3421e86202764ffa9cd5d" ON "line" ("solicitationId", "clin") `,
    );
    await queryRunner.query(
      `CREATE TABLE "approved_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "lineId" integer NOT NULL, "cage" varchar NOT NULL, "partNumber" varchar NOT NULL, "name" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b3dfc9d1f64625bea93cafce5d" ON "approved_source" ("lineId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "award_history" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "nsn" varchar NOT NULL, "awardDate" date NOT NULL, "contract" varchar NOT NULL, "cage" varchar, "quantity" real NOT NULL, "unitPrice" real NOT NULL, "surplus" boolean NOT NULL, "solicitationId" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5505f513c1649c0a9948629f1b" ON "award_history" ("solicitationId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d77ea80d0920ca5ca424493ff0" ON "award_history" ("nsn", "awardDate", "contract", "quantity", "unitPrice") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_4196bbc1025ff0166ab5f72161"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_solicitation" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "archiveId" integer NOT NULL, "number" varchar NOT NULL, "type" varchar NOT NULL, "issueDate" date, "quoteDueDate" date, "office" varchar, "buyer" varchar, "buyerCode" varchar, "setAside" varchar, "amsc" varchar, "firstArticle" boolean NOT NULL, "controlled" boolean NOT NULL, "sha256" varchar, "parserVersion" integer NOT NULL, "data" text NOT NULL, CONSTRAINT "FK_1c1a65b845c23cb283e60316d2e" FOREIGN KEY ("archiveId") REFERENCES "archive" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_solicitation"("id", "archiveId", "number", "type", "issueDate", "quoteDueDate", "office", "buyer", "buyerCode", "setAside", "amsc", "firstArticle", "controlled", "sha256", "parserVersion", "data") SELECT "id", "archiveId", "number", "type", "issueDate", "quoteDueDate", "office", "buyer", "buyerCode", "setAside", "amsc", "firstArticle", "controlled", "sha256", "parserVersion", "data" FROM "solicitation"`,
    );
    await queryRunner.query(`DROP TABLE "solicitation"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_solicitation" RENAME TO "solicitation"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4196bbc1025ff0166ab5f72161" ON "solicitation" ("archiveId", "number") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_948dc3421e86202764ffa9cd5d"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_line" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "solicitationId" integer NOT NULL, "clin" varchar NOT NULL, "nsn" varchar, "nomenclature" varchar, "quantity" real, "unit" varchar, "deliveryDays" integer, "fob" varchar, "purchaseRequest" varchar, CONSTRAINT "FK_8e86f8daf5ad93f2fd064d545f1" FOREIGN KEY ("solicitationId") REFERENCES "solicitation" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_line"("id", "solicitationId", "clin", "nsn", "nomenclature", "quantity", "unit", "deliveryDays", "fob", "purchaseRequest") SELECT "id", "solicitationId", "clin", "nsn", "nomenclature", "quantity", "unit", "deliveryDays", "fob", "purchaseRequest" FROM "line"`,
    );
    await queryRunner.query(`DROP TABLE "line"`);
    await queryRunner.query(`ALTER TABLE "temporary_line" RENAME TO "line"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_948dc3421e86202764ffa9cd5d" ON "line" ("solicitationId", "clin") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_b3dfc9d1f64625bea93cafce5d"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_approved_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "lineId" integer NOT NULL, "cage" varchar NOT NULL, "partNumber" varchar NOT NULL, "name" varchar NOT NULL, CONSTRAINT "FK_b3dfc9d1f64625bea93cafce5d8" FOREIGN KEY ("lineId") REFERENCES "line" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_approved_source"("id", "lineId", "cage", "partNumber", "name") SELECT "id", "lineId", "cage", "partNumber", "name" FROM "approved_source"`,
    );
    await queryRunner.query(`DROP TABLE "approved_source"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_approved_source" RENAME TO "approved_source"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b3dfc9d1f64625bea93cafce5d" ON "approved_source" ("lineId") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_5505f513c1649c0a9948629f1b"`);
    await queryRunner.query(`DROP INDEX "IDX_d77ea80d0920ca5ca424493ff0"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_award_history" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "nsn" varchar NOT NULL, "awardDate" date NOT NULL, "contract" varchar NOT NULL, "cage" varchar, "quantity" real NOT NULL, "unitPrice" real NOT NULL, "surplus" boolean NOT NULL, "solicitationId" integer NOT NULL, CONSTRAINT "FK_5505f513c1649c0a9948629f1b2" FOREIGN KEY ("solicitationId") REFERENCES "solicitation" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_award_history"("id", "nsn", "awardDate", "contract", "cage", "quantity", "unitPrice", "surplus", "solicitationId") SELECT "id", "nsn", "awardDate", "contract", "cage", "quantity", "unitPrice", "surplus", "solicitationId" FROM "award_history"`,
    );
    await queryRunner.query(`DROP TABLE "award_history"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_award_history" RENAME TO "award_history"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5505f513c1649c0a9948629f1b" ON "award_history" ("solicitationId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d77ea80d0920ca5ca424493ff0" ON "award_history" ("nsn", "awardDate", "contract", "quantity", "unitPrice") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_d77ea80d0920ca5ca424493ff0"`);
    await queryRunner.query(`DROP INDEX "IDX_5505f513c1649c0a9948629f1b"`);
    await queryRunner.query(
      `ALTER TABLE "award_history" RENAME TO "temporary_award_history"`,
    );
    await queryRunner.query(
      `CREATE TABLE "award_history" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "nsn" varchar NOT NULL, "awardDate" date NOT NULL, "contract" varchar NOT NULL, "cage" varchar, "quantity" real NOT NULL, "unitPrice" real NOT NULL, "surplus" boolean NOT NULL, "solicitationId" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "award_history"("id", "nsn", "awardDate", "contract", "cage", "quantity", "unitPrice", "surplus", "solicitationId") SELECT "id", "nsn", "awardDate", "contract", "cage", "quantity", "unitPrice", "surplus", "solicitationId" FROM "temporary_award_history"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_award_history"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d77ea80d0920ca5ca424493ff0" ON "award_history" ("nsn", "awardDate", "contract", "quantity", "unitPrice") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5505f513c1649c0a9948629f1b" ON "award_history" ("solicitationId") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_b3dfc9d1f64625bea93cafce5d"`);
    await queryRunner.query(
      `ALTER TABLE "approved_source" RENAME TO "temporary_approved_source"`,
    );
    await queryRunner.query(
      `CREATE TABLE "approved_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "lineId" integer NOT NULL, "cage" varchar NOT NULL, "partNumber" varchar NOT NULL, "name" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "approved_source"("id", "lineId", "cage", "partNumber", "name") SELECT "id", "lineId", "cage", "partNumber", "name" FROM "temporary_approved_source"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_approved_source"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_b3dfc9d1f64625bea93cafce5d" ON "approved_source" ("lineId") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_948dc3421e86202764ffa9cd5d"`);
    await queryRunner.query(`ALTER TABLE "line" RENAME TO "temporary_line"`);
    await queryRunner.query(
      `CREATE TABLE "line" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "solicitationId" integer NOT NULL, "clin" varchar NOT NULL, "nsn" varchar, "nomenclature" varchar, "quantity" real, "unit" varchar, "deliveryDays" integer, "fob" varchar, "purchaseRequest" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "line"("id", "solicitationId", "clin", "nsn", "nomenclature", "quantity", "unit", "deliveryDays", "fob", "purchaseRequest") SELECT "id", "solicitationId", "clin", "nsn", "nomenclature", "quantity", "unit", "deliveryDays", "fob", "purchaseRequest" FROM "temporary_line"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_line"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_948dc3421e86202764ffa9cd5d" ON "line" ("solicitationId", "clin") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_4196bbc1025ff0166ab5f72161"`);
    await queryRunner.query(
      `ALTER TABLE "solicitation" RENAME TO "temporary_solicitation"`,
    );
    await queryRunner.query(
      `CREATE TABLE "solicitation" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "archiveId" integer NOT NULL, "number" varchar NOT NULL, "type" varchar NOT NULL, "issueDate" date, "quoteDueDate" date, "office" varchar, "buyer" varchar, "buyerCode" varchar, "setAside" varchar, "amsc" varchar, "firstArticle" boolean NOT NULL, "controlled" boolean NOT NULL, "sha256" varchar, "parserVersion" integer NOT NULL, "data" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "solicitation"("id", "archiveId", "number", "type", "issueDate", "quoteDueDate", "office", "buyer", "buyerCode", "setAside", "amsc", "firstArticle", "controlled", "sha256", "parserVersion", "data") SELECT "id", "archiveId", "number", "type", "issueDate", "quoteDueDate", "office", "buyer", "buyerCode", "setAside", "amsc", "firstArticle", "controlled", "sha256", "parserVersion", "data" FROM "temporary_solicitation"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_solicitation"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4196bbc1025ff0166ab5f72161" ON "solicitation" ("archiveId", "number") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_d77ea80d0920ca5ca424493ff0"`);
    await queryRunner.query(`DROP INDEX "IDX_5505f513c1649c0a9948629f1b"`);
    await queryRunner.query(`DROP TABLE "award_history"`);
    await queryRunner.query(`DROP INDEX "IDX_b3dfc9d1f64625bea93cafce5d"`);
    await queryRunner.query(`DROP TABLE "approved_source"`);
    await queryRunner.query(`DROP INDEX "IDX_948dc3421e86202764ffa9cd5d"`);
    await queryRunner.query(`DROP TABLE "line"`);
    await queryRunner.query(`DROP INDEX "IDX_4196bbc1025ff0166ab5f72161"`);
    await queryRunner.query(`DROP TABLE "solicitation"`);
    await queryRunner.query(`DROP TABLE "archive"`);
    await queryRunner.query(`DROP TABLE "user"`);
  }
}
