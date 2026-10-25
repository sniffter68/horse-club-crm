// Existing bot formatting tests provide model fixtures; translate them to the new identity contract.
exports.identityFixture = prisma => ({ identify: async () => {
  const trainer = await prisma.trainer?.findUnique({ where: { vkUserId: 42n } });
  if (trainer) return { type: 'STAFF', role: 'TRAINER', staffId: 'staff', trainerId: trainer.id, name: trainer.name };
  const client = await prisma.client?.findUnique({ where: { vkId: '42' } });
  return client ? { type: 'CLIENT', clientId: client.id, name: client.name || client.firstName } : { type: 'UNKNOWN' };
} });
