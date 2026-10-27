import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { Repository } from 'typeorm';
import { Archive } from './ingest/archive.entity.js';
import { indexRows } from './ingest/dibbs.js';
import { PARSER_VERSION } from './parser/parse.js';
import { type RfqJson, storeRfq } from './solicitations/solicitation.entity.js';

/**
 * Every 33rd RFQ of DIBBS's 2026-10-22 archive as parser/parse.js writes it, and those RFQs' rows of
 * that day's index. Rebuild both after a parser change, from the repo root (parsed day in data/CA261022-pdfjs,
 * index in IN261022.TXT):
 *   ls data/CA261022-pdfjs/*.json | awk 'NR % 33 == 1' | xargs jq -s . > backend/demo/ca261022.json
 *   jq -r '.[].solicitation.number | gsub("-"; "")' backend/demo/ca261022.json | grep -F -f - IN261022.TXT > backend/demo/in261022.txt
 * (src/ and dist/ sit side by side, so these URLs work from both)
 */
const SAMPLE = new URL('../demo/ca261022.json', import.meta.url);
const INDEX = new URL('../demo/in261022.txt', import.meta.url);

/** Gives a fresh install something to show: one archive of real RFQs, flagged demo. */
@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectRepository(Archive) private readonly archives: Repository<Archive>,
  ) {}

  // First start only: once any archive exists, this never adds anything again.
  async onApplicationBootstrap() {
    if (await this.archives.exists()) return;
    const sample = JSON.parse(await readFile(SAMPLE, 'utf8')) as RfqJson[];
    const index = indexRows(await readFile(INDEX, 'latin1'));
    await this.archives.manager.transaction(async (em) => {
      const { id } = await em.save(Archive, {
        date: '2026-10-22',
        fileUrl:
          'https://dibbs2.bsm.dla.mil/Downloads/RFQ/Archive/ca261022.zip',
        state: 'parsed',
        demo: true,
      });
      for (const json of sample) {
        const row = index.get(json.solicitation.number.replaceAll('-', ''));
        await storeRfq(em, id, json, row, {
          sha256: null,
          parserVersion: PARSER_VERSION,
        });
      }
    });
    this.logger.log(`Added demo archive 2026-10-22 with ${sample.length} RFQs`);
  }
}
