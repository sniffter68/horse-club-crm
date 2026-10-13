const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, readdir, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { JwtService } = require('@nestjs/jwt');
const { PassportModule } = require('@nestjs/passport');
const request = require('supertest');
const { UploadController } = require('../dist/upload/upload.controller');
const { UploadStorage, UPLOAD_DIRECTORY, MAX_IMAGE_SIZE, serveUploads } = require('../dist/upload/upload.storage');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { AUTH_OPTIONS } = require('../dist/auth/auth.config');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { requestLimits } = require('../dist/common/request-limits');
const { sessionCookieName } = require('../dist/auth/session-cookie');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWuoAAAAASUVORK5CYII=', 'base64');

test('authenticated image upload validates files, persists unique names and serves public images', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'horse-upload-'));
  const secret = 'upload-test-secret-abcdefghijklmnopqrstuvwxyz0123456789';
  const user = { id: 'u1', email: 'admin@example.com', role: 'ADMIN', tokenVersion: 1 };
  const jwt = new JwtService({ secret });
  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role, authVersion: '1' }, { expiresIn: '5m' });
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt', session: false })],
    controllers: [UploadController],
    providers: [UploadStorage, JwtAuthGuard, JwtStrategy,
      { provide: UPLOAD_DIRECTORY, useValue: directory },
      { provide: AUTH_OPTIONS, useValue: { secret } },
      { provide: PrismaService, useValue: { user: { findUnique: async () => user } } },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.use(requestLimits());
  serveUploads(app, directory);
  app.setGlobalPrefix('api');
  await app.init();
  const server = app.getHttpServer();
  const upload = () => request(server).post('/api/upload/image').auth(token, { type: 'bearer' });
  try {
    await t.test('requires a valid session before accepting the multipart body', async () => {
      await request(server).post('/api/upload/image').attach('file', png, 'photo.png').expect(401);
      await request(server).post('/api/upload/image').auth('invalid', { type: 'bearer' }).attach('file', png, 'photo.png').expect(401);
      assert.deepEqual(await readdir(directory), []);
    });
    await t.test('rejects missing, empty, wrong MIME, disguised and oversized files', async () => {
      await upload().expect(400);
      await upload().attach('file', Buffer.alloc(0), 'empty.png').expect(400);
      await upload().attach('file', png, { filename: 'fake.png', contentType: 'text/plain' }).expect(400);
      await upload().attach('file', Buffer.from('<svg/>'), { filename: 'photo.svg', contentType: 'image/svg+xml' }).expect(400);
      await upload().attach('file', Buffer.from('<script>bad</script>'), { filename: 'fake.png', contentType: 'image/png' }).expect(400);
      await upload().attach('file', Buffer.alloc(MAX_IMAGE_SIZE + 1), { filename: 'large.png', contentType: 'image/png' }).expect(413);
      await upload().attach('other', png, 'photo.png').expect(400);
      await upload().attach('file', png, '1.png').attach('file', png, '2.png').expect(400);
      assert.deepEqual(await readdir(directory), []);
    });
    await t.test('cookie sessions retain same-origin CSRF protection', async () => {
      await request(server).post('/api/upload/image').set('Cookie', `${sessionCookieName()}=${token}`)
        .set('Origin', 'https://evil.example').attach('file', png, 'photo.png').expect(403);
      await request(server).post('/api/upload/image').set('Host', 'crm.example').set('Origin', 'http://crm.example')
        .set('Cookie', `${sessionCookieName()}=${token}`).attach('file', png, 'photo.png').expect(201);
    });
    await t.test('preserves bytes, chooses extension by MIME and uses unique UUIDs', async () => {
      const urls = new Set();
      for (let i = 0; i < 2; i++) {
        const { body } = await upload().attach('file', png, { filename: '../../unsafe.exe', contentType: 'image/png' }).expect(201);
        assert.match(body.url, /^\/uploads\/[0-9a-f-]{36}\.png$/);
        urls.add(body.url);
        assert.deepEqual(await readFile(join(directory, body.url.split('/').pop())), png);
        const response = await request(server).get(body.url).expect(200).expect('Content-Type', /image\/png/)
          .expect('X-Content-Type-Options', 'nosniff').expect('Cache-Control', /immutable/);
        assert.deepEqual(response.body, png);
      }
      assert.equal(urls.size, 2);
      await request(server).get('/uploads/missing.png').expect(404);
      await request(server).get('/uploads/.hidden').expect(404);
    });
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
