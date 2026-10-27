import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { options } from '../src/data-source.js';
import { Archive } from '../src/ingest/archive.entity.js';
import {
  ApprovedSource,
  AwardHistory,
  Line,
  type RfqJson,
  Solicitation,
  storeRfq,
} from '../src/solicitations/solicitation.entity.js';
import { SolicitationsController } from '../src/solicitations/solicitations.controller.js';

// The parser's real output for a public RFQ: one CLIN, one approved source, 20 past awards.
const sample = JSON.parse(
  readFileSync(
    new URL('./fixtures/SPE7L327U0039.json', import.meta.url),
    'utf8',
  ),
) as RfqJson;
// The negative row: export-controlled, no index row, sources or awards, and no '%' anywhere.
const stub: RfqJson = {
  solicitation: { number: 'TEST00-26-T-0001', quote_due_date: '2026-12-01' },
  items: [
    {
      description: 'STUB ITEM',
      requirement_codes: [{ code: 'RQ032' }],
      clins: [{ clin: '0001', nsn: '1111-00-000-0001' }],
    },
  ],
};
// The daily index moved the due date out, as it does for a re-posted RFQ.
const index = { quoteDueDate: '2026-11-09', setAside: 'H', amsc: 'Z' };

describe('Solicitations (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let day: number;
  const api = () => request(app.getHttpServer());
  const addDay = (date: string) =>
    db.getRepository(Archive).save({
      date,
      fileUrl: `https://example.test/ca${date.slice(2).replaceAll('-', '')}.zip`,
      state: 'parsed' as const,
    });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(options), // :memory:, migrated (vitest.config.e2e.ts)
        TypeOrmModule.forFeature([Solicitation]),
      ],
      controllers: [SolicitationsController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = moduleRef.get(getDataSourceToken());
    ({ id: day } = await addDay('2026-10-22'));
    await db.transaction(async (em) => {
      await storeRfq(em, day, sample, index, {
        sha256: 'f00',
        parserVersion: 1,
      });
      await storeRfq(em, day, stub, undefined, {
        sha256: null,
        parserVersion: 1,
      });
    });
  });

  afterEach(() => app.close());

  const numbers = async (q: string) => {
    const { body } = await api()
      .get(`/archives/${day}/lines`)
      .query({ q })
      .expect(200);
    return (body as { number: string }[]).map((r) => r.number);
  };

  it('lists each line with its RFQ, approved sources and the latest award', async () => {
    const { body } = await api().get(`/archives/${day}/lines`).expect(200);
    expect(body).toHaveLength(2);
    for (const row of body) expect(row).not.toHaveProperty('data');
    expect(body).toEqual([
      expect.objectContaining({
        number: 'SPE7L3-27-U-0039',
        clin: '0001',
        // T and U RFQs name the item in its description, not the CLIN.
        nomenclature: 'PUMP,FUEL,METERING AND DISTRIBUTING',
        nsn: '2910-01-589-1060',
        quantity: 28,
        unit: 'EA',
        quoteDueDate: '2026-11-09', // the index's, not the PDF's 2026-11-06
        deliveryDays: 84,
        setAside: 'H',
        amsc: 'Z',
        controlled: false,
        firstArticle: false,
        office: 'DLA WEAPONS SUPPORT',
        buyer: 'AARON MOORE',
        fob: 'ORIGIN',
        cages: '75755',
        lastPrice: 2417,
        lastQuantity: 11,
        lastCage: '13WM9',
        lastAwardDate: '2026-08-27',
        lastSurplus: false,
      }),
      expect.objectContaining({
        number: 'TEST00-26-T-0001',
        quoteDueDate: '2026-12-01', // the PDF's, without an index row
        setAside: null,
        controlled: true,
        cages: null,
        lastPrice: null,
        lastSurplus: null,
      }),
    ]);
  });

  it('searches text values anywhere in the JSON, but not key names', async () => {
    expect(await numbers('additive manufacturing')).toEqual([
      'SPE7L3-27-U-0039',
    ]);
    expect(await numbers('no such text')).toEqual([]);
    expect(await numbers('approved_sources')).toEqual([]); // a key, never a value
    expect(await numbers('%')).toEqual(['SPE7L3-27-U-0039']); // literal, not a wildcard
  });

  it('rejects a repeated q', () =>
    api().get(`/archives/${day}/lines?q=a&q=b`).expect(400));

  it('returns one RFQ with its JSON and the awards on record for its NSN', async () => {
    const { id } = await db
      .getRepository(Solicitation)
      .findOneByOrFail({ number: 'SPE7L3-27-U-0039' });
    const { body } = await api().get(`/solicitations/${id}`).expect(200);
    expect(body.data).toEqual(sample);
    expect(body.awards).toHaveLength(20);
    expect(body.awards[0]).toMatchObject({
      awardDate: '2026-08-27',
      unitPrice: 2417,
    });
    await api().get('/solicitations/999999').expect(404);
  });

  it('serves the PDF the RFQ was parsed from, and 404 when there is none', async () => {
    // A day folder of its own: ca261022 can be a real downloaded day, and demo.e2e-spec.ts
    // writes ca991231 at the same time.
    const dir = 'data/archive/ca991230';
    const fixture = 'test/fixtures/SPE7L327U0039.pdf';
    const { id: dayId } = await addDay('2099-12-30');
    await db.transaction((em) =>
      storeRfq(em, dayId, sample, index, { sha256: 'f00', parserVersion: 1 }),
    );
    const rfqs = db.getRepository(Solicitation);
    const { id } = await rfqs.findOneByOrFail({ archiveId: dayId });
    await mkdir(dir, { recursive: true });
    try {
      await copyFile(fixture, `${dir}/SPE7L327U0039.pdf`);
      const { body } = await api()
        .get(`/solicitations/${id}/pdf`)
        .expect(200)
        .expect('Content-Type', 'application/pdf');
      expect(body.equals(readFileSync(fixture))).toBe(true);
      await rm(`${dir}/SPE7L327U0039.pdf`);
      await api().get(`/solicitations/${id}/pdf`).expect(404);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    const stub = await rfqs.findOneByOrFail({ number: 'TEST00-26-T-0001' });
    await api().get(`/solicitations/${stub.id}/pdf`).expect(404); // no source_file
    await api().get('/solicitations/999999/pdf').expect(404);
  });

  it('keeps one row per award when a later day prints it again', async () => {
    const { id } = await addDay('2026-10-23');
    await db.transaction((em) =>
      storeRfq(em, id, sample, index, { sha256: 'f00', parserVersion: 1 }),
    );
    expect(await db.getRepository(AwardHistory).count()).toBe(20);
  });

  it('deleting a day deletes its RFQs, lines, sources and awards', async () => {
    await db.getRepository(Archive).delete(day);
    for (const entity of [Solicitation, Line, ApprovedSource, AwardHistory])
      expect(await db.getRepository(entity).count()).toBe(0);
  });
});
