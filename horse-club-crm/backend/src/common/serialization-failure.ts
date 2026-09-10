// Prisma transaction errors and raw PostgreSQL SQLSTATE envelopes.
export function isSerializationFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; meta?: { code?: unknown } };
  return value.code === 'P2034' || value.code === '40001' || value.code === '40P01'
    || (value.code === 'P2010' && (value.meta?.code === '40001' || value.meta?.code === '40P01'));
}
