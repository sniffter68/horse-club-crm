import { ForbiddenException, NotFoundException } from '@nestjs/common';

export const demoAccounts = {
  OWNER: { id: 'de000000-0000-4000-8000-000000000001', email: 'owner@silver-horses.example', role: 'ADMIN' },
  ADMIN: { id: 'de000000-0000-4000-8000-000000000002', email: 'admin@silver-horses.example', role: 'MANAGER' },
  TRAINER: { id: 'de000000-0000-4000-8000-000000000003', email: 'trainer@silver-horses.example', role: 'TRAINER' },
} as const;
export type DemoRole = keyof typeof demoAccounts;
export const demoId = (group: number, index: number): string =>
  `de000000-${String(group).padStart(4, '0')}-4000-8000-${String(index).padStart(12, '0')}`;

export function requireDemo(): void {
  if (process.env.DEMO_MODE !== 'true') throw new NotFoundException();
  let database: string;
  try { database = decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)); }
  catch { throw new ForbiddenException('Для демо требуется отдельная база с суффиксом _demo'); }
  if (!database.endsWith('_demo')) throw new ForbiddenException('Для демо требуется отдельная база с суффиксом _demo');
}
