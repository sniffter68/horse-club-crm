// Existing bot formatting tests provide model fixtures; translate them to the new identity contract.
exports.idleConversation = () => ({
  findUnique: async () => null,
  upsert: async () => ({}),
  updateMany: async () => ({ count: 0 }),
});
exports.identityFixture = prisma => {
  prisma.vkConversationState ??= exports.idleConversation();
  return { identify: async () => {
    const trainer = await prisma.trainer?.findUnique({ where: { vkId: 42n } });
    if (trainer) return { type: 'TRAINER', id: trainer.id, name: trainer.name };
    const client = await prisma.client?.findUnique({ where: { vkId: '42' } });
    return client ? { type: 'CLIENT', clientId: client.id, name: client.name || client.firstName } : { type: 'UNKNOWN' };
  } };
};
