import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Repository } from 'typeorm';
import { Archive } from '../src/ingest/archive.entity.js';
import { Rfq, type RfqJson } from '../src/rfq/rfq.entity.js';
import { RfqsController } from '../src/rfq/rfqs.controller.js';

// The parser's real output. If its shape drifts, these tests point at Rfq.from().
const sample = JSON.parse(
  readFileSync(new URL('../../SPE1C127Q0018.json', import.meta.url), 'utf8'),
) as RfqJson;

describe('RFQs (e2e)', () => {
  let app: INestApplication<App>;
  let archives: Repository<Archive>;
  let rfqs: Repository<Rfq>;
  let archiveId: number;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Archive, Rfq],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Archive, Rfq]),
      ],
      controllers: [RfqsController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    archives = moduleRef.get(getRepositoryToken(Archive));
    rfqs = moduleRef.get(getRepositoryToken(Rfq));
    ({ id: archiveId } = await archives.save({
      date: '2026-10-22',
      fileUrl: 'https://example.test/ca261022.zip',
      state: 'parsed',
    }));
    await rfqs.save([
      Rfq.from(archiveId, sample),
      // Nothing in here contains '%', so a search for '%' must skip it.
      Rfq.from(archiveId, { solicitation: { number: 'TEST-0001' } }),
    ]);
  });

  afterEach(() => app.close());

  const numbers = async (q: string) => {
    const { body } = await request(app.getHttpServer())
      .get(`/archives/${archiveId}/rfqs`)
      .query({ q })
      .expect(200);
    return (body as Rfq[]).map((r) => r.number);
  };

  it('lists the copied columns without the JSON', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/archives/${archiveId}/rfqs`)
      .expect(200);
    expect(body).toHaveLength(2);
    for (const row of body) expect(row).not.toHaveProperty('data');
    expect(
      (body as Rfq[]).find((r) => r.number === 'SPE1C1-27-Q-0018'),
    ).toMatchObject({
      quoteDueDate: '2026-10-29',
      setAside: false,
      office: 'DLA TROOP SUPPORT',
      buyer: 'LAUREN BRADLEY',
      nsn: '8455-01-271-3097',
      item: 'INSIGNIA,RANK,OFFICER',
      quantity: 1000,
      unit: 'PR',
      fob: 'DESTINATION',
    });
  });

  it('searches text values anywhere in the JSON, but not key names', async () => {
    expect(await numbers('heraldry')).toEqual(['SPE1C1-27-Q-0018']); // only in the notes
    expect(await numbers('no such text')).toEqual([]);
    expect(await numbers('fob')).toEqual([]); // a key in the sample, never a value
    expect(await numbers('%')).toEqual(['SPE1C1-27-Q-0018']); // literal, not a wildcard
  });

  it('rejects a repeated q', () =>
    request(app.getHttpServer())
      .get(`/archives/${archiveId}/rfqs?q=a&q=b`)
      .expect(400));

  it('returns one RFQ with its full JSON', async () => {
    const { id } = await rfqs.findOneByOrFail({ number: 'SPE1C1-27-Q-0018' });
    const { body } = await request(app.getHttpServer())
      .get(`/rfqs/${id}`)
      .expect(200);
    expect(body.data).toEqual(sample);
    await request(app.getHttpServer()).get('/rfqs/999999').expect(404);
  });

  it('deleting an archive deletes its RFQs', async () => {
    await archives.delete(archiveId);
    expect(await rfqs.count()).toBe(0);
  });
});
