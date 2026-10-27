import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { IsNull, Not, Repository } from 'typeorm';
import { options } from '../src/data-source.js';
import { DemoService } from '../src/demo.service.js';
import { Archive } from '../src/ingest/archive.entity.js';
import { ArchivesController } from '../src/ingest/archives.controller.js';
import { IngestService } from '../src/ingest/ingest.service.js';
import {
  AwardHistory,
  Line,
  Solicitation,
} from '../src/solicitations/solicitation.entity.js';

const url = (date: string) =>
  `https://dibbs2.bsm.dla.mil/Downloads/RFQ/Archive/ca${date.slice(2).replaceAll('-', '')}.zip`;
// The DIBBS dates page, newest first. The demo archive is 2026-10-22.
const listed = ['2026-10-24', '2026-10-23', '2026-10-22'].map((date) => ({
  date,
  fileUrl: url(date),
}));

describe('Ingest and demo data (e2e)', () => {
  let app: INestApplication<App>;
  let archives: Repository<Archive>;
  let solicitations: Repository<Solicitation>;
  let ingest: IngestService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(options), // :memory:, migrated (vitest.config.e2e.ts)
        TypeOrmModule.forFeature([Archive]),
      ],
      controllers: [ArchivesController],
      providers: [IngestService, DemoService],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init(); // runs the seed

    archives = moduleRef.get(getRepositoryToken(Archive));
    solicitations = archives.manager.getRepository(Solicitation);
    ingest = moduleRef.get(IngestService);
    vi.spyOn(ingest, 'listed').mockResolvedValue(listed); // no network
  });

  afterEach(() => app.close());

  it('seeds an empty database once, flagged demo', async () => {
    expect(await archives.find()).toMatchObject([
      { date: '2026-10-22', state: 'parsed', demo: true, errors: null },
    ]);
    expect(await solicitations.count()).toBe(102);
    const lines = archives.manager.getRepository(Line);
    expect(await lines.count()).toBe(114);
    // T and U RFQs name the item in the description, not in the CLIN.
    expect(await lines.countBy({ nomenclature: IsNull() })).toBe(0);
    expect(await solicitations.countBy({ controlled: true })).toBe(40);
    // Every demo RFQ has its row of the day's index.
    expect(await solicitations.countBy({ setAside: Not(IsNull()) })).toBe(102);
    await app.get(DemoService).onApplicationBootstrap();
    expect(await archives.count()).toBe(1);
    expect(await solicitations.count()).toBe(102);
  });

  it("the job doesn't take the demo for a download, and the real day replaces it", async () => {
    const download = vi
      .spyOn(ingest as any, 'download')
      .mockResolvedValue(undefined);
    const parse = vi.spyOn(ingest, 'parse').mockResolvedValue(undefined);
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
    expect(parse.mock.calls.map(([a]) => a.date)).toEqual([
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
    expect(await archives.countBy({ demo: true })).toBe(0);
    expect(await solicitations.count()).toBe(0);
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
    expect(await solicitations.count()).toBe(0);
  });

  it('a failed DIBBS check shows in the status, and downloaded days still get parsed', async () => {
    vi.spyOn(ingest, 'listed').mockRejectedValue(new Error('DIBBS down'));
    const parse = vi.spyOn(ingest, 'parse').mockResolvedValue(undefined);
    await archives.save({
      date: '2026-10-21',
      fileUrl: url('2026-10-21'),
      state: 'downloaded',
    });
    await ingest.run();
    expect(parse).toHaveBeenCalledTimes(1);
    const { body } = await request(app.getHttpServer())
      .get('/archives/status')
      .expect(200);
    expect(body.lastCheck).toMatchObject({ error: 'DIBBS down' });
  });

  describe('parsing a downloaded day', () => {
    const dir = 'data/archive/ca991231'; // backend/data, next to where the job keeps real days
    // The fixture's real row of the 2026-10-22 index, with its due date moved to 12/31/99.
    const indexRow =
      'SPE7L327U00392910015891060                                    100024754712/31/99SPE7L327U0039.pdf  0000028EAPUMP,FUEL,METERING ANPLCL6Z1H100';

    beforeEach(async () => {
      await mkdir(dir, { recursive: true });
      await copyFile(
        'test/fixtures/SPE7L327U0039.pdf',
        `${dir}/SPE7L327U0039.pdf`,
      );
      await writeFile(`${dir}/broken.pdf`, 'not a PDF');
      await writeFile(`${dir}/in991231.txt`, `${indexRow}\r\n`);
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    it('stores what it can read, lists what it cannot, and can do it again', async () => {
      const day = await archives.save({
        date: '2099-12-31',
        fileUrl: url('2099-12-31'),
        state: 'downloaded',
      });
      for (let run = 0; run < 2; run++) {
        await ingest.parse(day);
        expect(await solicitations.findBy({ archiveId: day.id })).toMatchObject(
          [
            {
              number: 'SPE7L3-27-U-0039',
              quoteDueDate: '2099-12-31',
              setAside: 'H',
              amsc: 'Z',
              parserVersion: 1,
              sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            },
          ],
        );
        expect(await archives.findOneByOrFail({ id: day.id })).toMatchObject({
          state: 'parsed',
          errors: [{ file: 'broken.pdf', error: expect.any(String) }],
        });
      }
    });

    it('keeps an RFQ and its awards when its PDF fails on a later parse', async () => {
      const day = await archives.save({
        date: '2099-12-31',
        fileUrl: url('2099-12-31'),
        state: 'downloaded',
      });
      await ingest.parse(day);
      const awards = () =>
        archives.manager
          .getRepository(AwardHistory)
          .countBy({ nsn: '2910-01-589-1060' }); // the fixture's; the demo seed has its own
      expect(await awards()).toBe(20);
      await writeFile(`${dir}/SPE7L327U0039.pdf`, 'damaged since');
      await ingest.parse(day);
      expect(await solicitations.countBy({ archiveId: day.id })).toBe(1);
      expect(await awards()).toBe(20);
      expect(
        (await archives.findOneByOrFail({ id: day.id })).errors?.map(
          (e) => e.file,
        ),
      ).toEqual(['SPE7L327U0039.pdf', 'broken.pdf']);
    });
  });
});
