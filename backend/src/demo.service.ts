import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { Repository } from 'typeorm';
import { Archive } from './ingest/archive.entity.js';
import { Rfq, type RfqJson } from './rfq/rfq.entity.js';

/**
 * Every 33rd RFQ rfq2json.js wrote for DIBBS's 2026-10-22 archive. To rebuild it, from the repo root:
 * ls data/CA261022/*.json | awk 'NR % 33 == 1' | xargs jq -s . > backend/demo/ca261022.json
 */
const SAMPLE = new URL('../demo/ca261022.json', import.meta.url); // backend/demo, from src/ and dist/

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
    await this.archives.manager.transaction(async (em) => {
      const { id } = await em.save(Archive, {
        date: '2026-10-22',
        fileUrl:
          'https://dibbs2.bsm.dla.mil/Downloads/RFQ/Archive/ca261022.zip',
        state: 'parsed',
        demo: true,
      });
      await em.save(sample.map((json) => Rfq.from(id, json)));
    });
    this.logger.log(`Added demo archive 2026-10-22 with ${sample.length} RFQs`);
  }
}
