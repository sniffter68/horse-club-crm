require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { VkIdentityService } = require('../dist/vk-bot/vk-identity.service');
const { ClientsService } = require('../dist/clients/clients.service');

function fixture(kind, archived) {
  const old = { id: 'old', vkId: '42', vkUserId: 42n, trainerId: kind === 'user' ? 'trainer' : null,
    deletedAt: kind === 'client' && archived ? new Date() : null,
    staffProfile: { isActive: !archived } };
  const target = { id: 'target', trainerId: null, vkId: null, vkUserId: null };
  const trainer = { id: 'trainer', vkId: kind === 'user' ? 42n : null };
  const notifications = [];
  const tx = {
    client: {
      findFirst: async () => kind === 'client' && old.vkId ? old : null,
      update: async ({ data }) => Object.assign(old, data),
    },
    user: {
      findFirst: async () => kind === 'user' && old.vkId ? old : null,
      findUnique: async () => target,
      update: async ({ where, data }) => Object.assign(where.id === 'old' ? old : target, data),
    },
    trainer: {
      findUnique: async () => trainer.vkId ? trainer : null,
      updateMany: async ({ data }) => { Object.assign(trainer, data); return { count: 1 }; },
    },
    vkNotification: { deleteMany: async query => { notifications.push(query); return { count: 1 }; } },
  };
  const prisma = { $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); return work(tx);
  } };
  return { old, target, trainer, tx, notifications, service: new VkIdentityService(prisma) };
}

for (const kind of ['client', 'user']) {
  test(`legacy archived ${kind} releases unique fields before staff binding`, async () => {
    const f = fixture(kind, true);
    await f.service.setStaff('target', '42');
    assert.equal(f.old.vkId, null); assert.equal(f.old.vkUserId, null);
    assert.equal(f.target.vkId, '42'); assert.equal(f.target.vkUserId, 42n);
    assert.equal(f.trainer.vkId, null);
    assert.equal(f.notifications.length, 1);
  });
  test(`active ${kind} still blocks reassignment`, async () => {
    const f = fixture(kind, false);
    await assert.rejects(f.service.setStaff('target', '42'), error => error.getStatus() === 409);
    assert.equal(f.old.vkId, '42'); assert.equal(f.target.vkId, null);
  });
}

test('client soft deletion clears VK fields and pending notifications, preserving history', async () => {
  const row = { id: 'client', vkId: '42', vkUserId: 42n, vkScreenName: 'rider', deletedAt: null,
    boardingBalance: new Prisma.Decimal(0), _count: { bookings: 1 } };
  let removed = 0;
  const tx = {
    client: { findUnique: async () => row, update: async ({ data }) => Object.assign(row, data) },
    vkNotification: { deleteMany: async () => { removed++; return { count: 1 }; } },
  };
  const service = new ClientsService({ $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); return work(tx);
  } });
  assert.equal((await service.remove(row.id)).softDeleted, true);
  assert.ok(row.deletedAt instanceof Date);
  assert.equal(row.vkId, null); assert.equal(row.vkUserId, null); assert.equal(row.vkScreenName, null);
  assert.equal(row._count.bookings, 1); assert.equal(removed, 1);
});
