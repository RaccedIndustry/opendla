import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { IsNull, Repository } from 'typeorm';
import { DemoService } from '../src/demo.service.js';
import { Archive } from '../src/ingest/archive.entity.js';
import { ArchivesController } from '../src/ingest/archives.controller.js';
import { IngestService } from '../src/ingest/ingest.service.js';
import { Rfq } from '../src/rfq/rfq.entity.js';

const sample = JSON.parse(
  readFileSync(new URL('../demo/ca261022.json', import.meta.url), 'utf8'),
) as unknown[];

const url = (date: string) =>
  `https://dibbs2.bsm.dla.mil/Downloads/RFQ/Archive/ca${date.slice(2).replaceAll('-', '')}.zip`;
// The DIBBS dates page, newest first. The demo archive is 2026-10-22.
const listed = ['2026-10-24', '2026-10-23', '2026-10-22'].map((date) => ({
  date,
  fileUrl: url(date),
}));

describe('Demo data (e2e)', () => {
  let app: INestApplication<App>;
  let archives: Repository<Archive>;
  let rfqs: Repository<Rfq>;
  let ingest: IngestService;

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
      controllers: [ArchivesController],
      providers: [IngestService, DemoService],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init(); // runs the seed

    archives = moduleRef.get(getRepositoryToken(Archive));
    rfqs = moduleRef.get(getRepositoryToken(Rfq));
    ingest = moduleRef.get(IngestService);
    vi.spyOn(ingest, 'listed').mockResolvedValue(listed); // no network
  });

  afterEach(() => app.close());

  it('seeds an empty database once, flagged demo', async () => {
    expect(await archives.find()).toMatchObject([
      { date: '2026-10-22', state: 'parsed', demo: true },
    ]);
    expect(await rfqs.count()).toBe(sample.length);
    // T and U RFQs name the item in items[0].description, not in the CLIN.
    expect(await rfqs.countBy({ item: IsNull() })).toBe(0);
    await app.get(DemoService).onApplicationBootstrap();
    expect(await archives.count()).toBe(1);
    expect(await rfqs.count()).toBe(sample.length);
  });

  it("the job doesn't take the demo for a download, and the real day replaces it", async () => {
    const download = vi
      .spyOn(ingest as any, 'download')
      .mockResolvedValue(undefined);
    await archives.save({
      date: '2026-10-21',
      fileUrl: url('2026-10-21'),
      state: 'downloaded',
    });
    await ingest.run();
    expect(download.mock.calls).toEqual([
      [url('2026-10-22')],
      [url('2026-10-23')],
      [url('2026-10-24')],
    ]);
    expect(await archives.countBy({ demo: true })).toBe(0);
    expect(await rfqs.count()).toBe(0);
  });

  it('Add date replaces the demo day', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/archives')
      .send({ date: '2026-10-22' })
      .expect(201);
    expect(body).toMatchObject({
      date: '2026-10-22',
      state: 'pending',
      demo: false,
    });
    expect(await archives.countBy({ demo: true })).toBe(0);
    expect(await rfqs.count()).toBe(0);
  });
});
