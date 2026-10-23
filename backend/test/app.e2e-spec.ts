import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) needs a login', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });

  it('rejects a wrong password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'wrong' })
      .expect(401);
  });

  it('logs in as the seeded admin with an HttpOnly cookie', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin' })
      .expect(204);
    const cookie = login.get('Set-Cookie') ?? [];
    expect(cookie[0]).toContain('HttpOnly');
    expect(cookie[0]).toContain('SameSite=Strict');

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200)
      .expect(({ body }) => expect(body.username).toBe('admin'));
    await request(app.getHttpServer())
      .get('/')
      .set('Cookie', cookie)
      .expect(200, 'Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});
