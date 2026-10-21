const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { UnauthorizedException } = require('@nestjs/common');
const request = require('supertest');
const http = require('node:http');
const { LeadEventsService } = require('../dist/leads/lead-events.service');
const { LeadManagementController } = require('../dist/leads/lead-management.controller');
const { LeadsService } = require('../dist/leads/leads.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');

let app, events;
before(async () => {
  const module = await Test.createTestingModule({ controllers: [LeadManagementController], providers: [
    LeadEventsService, { provide: LeadsService, useValue: {} },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => {
    const req = context.switchToHttp().getRequest();
    if (!req.headers['x-test-role']) throw new UnauthorizedException();
    req.user = { role: req.headers['x-test-role'] }; return true;
  } }).compile();
  app = module.createNestApplication(); app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1'); events = module.get(LeadEventsService);
});
after(async () => app?.close());

test('SSE rejects anonymous, trainer and manager requests under existing lead policy', async () => {
  await request(app.getHttpServer()).get('/api/leads/events').expect(401);
  for (const role of ['TRAINER', 'STABLE_WORKER', 'MANAGER']) {
    await request(app.getHttpServer()).get('/api/leads/events').set('x-test-role', role).expect(403);
  }
});

test('authenticated SSE sends named events and removes subscribers after disconnect', async () => {
  const address = app.getHttpServer().address();
  await new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: address.port, path: '/api/leads/events', headers: { 'x-test-role': 'ADMIN' } }, res => {
      assert.match(res.headers['content-type'], /text\/event-stream/);
      let body = '', sent = false;
      res.on('data', chunk => {
        body += chunk;
        if (!sent && body.includes('event: ready')) {
          sent = true; events.publish({ id: 'lead-id', clientName: 'Анна', phone: '+79991234567', serviceName: 'Конкур', createdAt: new Date().toISOString() });
        }
        if (body.includes('event: lead:created')) {
          assert.match(body, /"clientName":"Анна"/); req.destroy(); resolve();
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('SSE timeout')); });
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(events.events.observed, false);
});

test('reconnect replays from the ready cursor, never replays on first connect, and bounds history', () => {
  const bus = new LeadEventsService(); const initial = [];
  const first = bus.stream().subscribe(event => initial.push(event)); first.unsubscribe();
  const cursor = initial[0].id;
  for (let i = 0; i < 110; i++) bus.publish({ id: String(i) });
  const replay = []; const subscription = bus.stream(cursor).subscribe(event => replay.push(event)); subscription.unsubscribe();
  assert.equal(replay.filter(event => event.type === 'lead:created').length, 100);
  const fresh = []; const clean = bus.stream().subscribe(event => fresh.push(event)); clean.unsubscribe();
  assert.deepEqual(fresh.map(event => event.type), ['ready']);
});
