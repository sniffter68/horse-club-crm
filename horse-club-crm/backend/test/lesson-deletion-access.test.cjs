require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { LessonsController } = require('../dist/lessons/lessons.controller');
const { LessonsService } = require('../dist/lessons/lessons.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { ModuleAccessGuard } = require('../dist/auth/module-access.guard');
const { ModuleAccessService } = require('../dist/settings/module-access.service');

test('DELETE lessons requires ADMIN/MANAGER, FULL schedule access and valid UUID', async () => {
  let accessLevel = 'FULL', calls = 0;
  const module = await Test.createTestingModule({ controllers: [LessonsController], providers: [
    RolesGuard, ModuleAccessGuard,
    { provide: ModuleAccessService, useValue: { forRole: async role => [{ module: 'SCHEDULE', isEnabled: true, accessLevel: role === 'ADMIN' ? 'FULL' : accessLevel }] } },
    { provide: LessonsService, useValue: { deleteLesson: async (_id, actor) => {
      assert.ok(['ADMIN', 'MANAGER'].includes(actor.role)); calls++;
      return { success: true, message: 'Занятие успешно удалено' };
    } } },
  ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest();
    req.user = req.headers['x-role'] ? { id: 'actor', role: req.headers['x-role'] } : undefined;
    return Boolean(req.user);
  } }).compile();
  const app = module.createNestApplication();
  await app.init();
  try {
    const api = () => request(app.getHttpServer());
    const url = '/lessons/11111111-1111-4111-8111-111111111111';
    for (const role of ['ADMIN', 'MANAGER']) {
      const result = await api().delete(url).set('x-role', role).expect(200);
      assert.equal(result.body.success, true);
    }
    for (const role of ['TRAINER', 'STABLE_WORKER']) await api().delete(url).set('x-role', role).expect(403);
    await api().delete(url).expect(403);
    for (const level of ['READ_ONLY', 'HIDDEN']) {
      accessLevel = level;
      await api().delete(url).set('x-role', 'MANAGER').expect(403);
    }
    await api().delete('/lessons/not-a-uuid').set('x-role', 'ADMIN').expect(400);
    assert.equal(calls, 2);
  } finally { await app.close(); }
});
