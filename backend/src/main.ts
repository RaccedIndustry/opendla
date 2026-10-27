import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { fileURLToPath } from 'node:url';
import { AppModule } from './app.module.js';

// Module-relative so any cwd works: dist/main.js → repo/frontend/build. Dev uses Vite's proxy instead.
const web = fileURLToPath(new URL('../../frontend/build/', import.meta.url));

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useStaticAssets(web);
  // SPA fallback: client-side routes like /rfqs get the app shell.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || /^\/api(\/|$)/i.test(req.path)) return next();
    res.sendFile('200.html', { root: web });
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
