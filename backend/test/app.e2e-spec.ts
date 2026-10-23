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

  it('manages users without exposing password hashes', async () => {
    const server = app.getHttpServer();
    const login = async (username: string, password: string) =>
      (
        await request(server)
          .post('/auth/login')
          .send({ username, password })
          .expect(204)
      ).get('Set-Cookie') ?? [];
    const admin = await login('admin', 'admin');
    const name = `e2e-${Date.now()}`;

    const { body: users } = await request(server)
      .get('/users')
      .set('Cookie', admin)
      .expect(200);
    for (const u of users)
      expect(Object.keys(u).sort()).toEqual(['id', 'username']);

    await request(server)
      .post('/users')
      .set('Cookie', admin)
      .send({ username: ' ', password: 'pw' })
      .expect(400);
    const { body: user } = await request(server)
      .post('/users')
      .set('Cookie', admin)
      .send({ username: name, password: 'pw' })
      .expect(201);
    await request(server)
      .post('/users')
      .set('Cookie', admin)
      .send({ username: name, password: 'pw' })
      .expect(409);

    // The new user can log in, can't delete itself, and is locked out once deleted.
    const own = await login(name, 'pw');
    await request(server)
      .delete(`/users/${user.id}`)
      .set('Cookie', own)
      .expect(400);
    await request(server)
      .delete(`/users/${user.id}`)
      .set('Cookie', admin)
      .expect(200);
    await request(server).get('/auth/me').set('Cookie', own).expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
