import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Archive } from '../src/ingest/archive.entity.js';
import { ArchivesController } from '../src/ingest/archives.controller.js';
import { IngestService } from '../src/ingest/ingest.service.js';

// Stands in for the DIBBS dates page and the job, so nothing goes over the network.
const listed = [
  {
    date: '2026-10-22',
    fileUrl: 'https://dibbs2.bsm.dla.mil/Downloads/RFQ/Archive/ca261022.zip',
  },
  {
    date: '2026-10-21',
    fileUrl: 'https://dibbs2.bsm.dla.mil/Downloads/RFQ/Archive/ca261021.zip',
  },
];
const ingest = {
  listed: vi.fn(() => Promise.resolve(listed)),
  run: vi.fn(() => Promise.resolve()),
};

describe('Archive actions (e2e)', () => {
  let app: INestApplication<App>;
  const api = () => request(app.getHttpServer());

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Archive],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Archive]),
      ],
      controllers: [ArchivesController],
      providers: [{ provide: IngestService, useValue: ingest }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('queues a listed day as pending with the URL DIBBS gives, once', async () => {
    const { body } = await api()
      .post('/archives')
      .send({ date: '2026-10-21' })
      .expect(201);
    expect(body).toMatchObject({
      date: '2026-10-21',
      fileUrl: listed[1].fileUrl,
      state: 'pending',
    });
    await api().post('/archives').send({ date: '2026-10-21' }).expect(409);
  });

  it('rejects days DIBBS does not list, and malformed dates', async () => {
    const { body } = await api()
      .post('/archives')
      .send({ date: '2026-10-18' })
      .expect(400);
    expect(body.message).toContain('It lists 2026-10-21 to 2026-10-22');
    for (const date of [
      '2026-02-30',
      '10/22/2026',
      '',
      undefined,
      ['2026-10-22'],
    ])
      await api().post('/archives').send({ date }).expect(400);
  });

  it('changes the state, and rejects unknown states and ids', async () => {
    const { body: added } = await api()
      .post('/archives')
      .send({ date: '2026-10-22' })
      .expect(201);
    await api()
      .patch(`/archives/${added.id}`)
      .send({ state: 'parsed' })
      .expect(200);
    const { body: rows } = await api().get('/archives').expect(200);
    expect(rows).toMatchObject([{ id: added.id, state: 'parsed' }]);
    await api()
      .patch(`/archives/${added.id}`)
      .send({ state: 'done' })
      .expect(400);
    await api().patch('/archives/999').send({ state: 'pending' }).expect(404);
  });

  it('starts the job and answers at once, even if the job then fails', async () => {
    ingest.run.mockImplementationOnce(() => new Promise<void>(() => {})); // never finishes
    await api().post('/archives/run').expect(202);
    ingest.run.mockImplementationOnce(() =>
      Promise.reject(new Error('DIBBS down')),
    );
    await api().post('/archives/run').expect(202);
    expect(ingest.run).toHaveBeenCalledTimes(2);
  });
});
