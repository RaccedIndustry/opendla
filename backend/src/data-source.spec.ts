import { DataSource } from 'typeorm';
import { options } from './data-source.js';

// Fails when an entity changes without a migration: npm run migration:generate -- src/migrations/<Name>
it('migrations build exactly the schema the entities describe', async () => {
  const db = await new DataSource({
    ...options,
    database: ':memory:',
  }).initialize();
  const { upQueries } = await db.driver.createSchemaBuilder().log();
  expect(upQueries.map((q) => q.query)).toEqual([]);
  await db.destroy();
});
