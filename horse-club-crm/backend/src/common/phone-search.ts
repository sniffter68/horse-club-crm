import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Match legacy masked numbers as well as canonical Russian 7/8 numbers. */
export async function phoneSearchIds(prisma: PrismaService, model: 'Client' | 'Trainer', query?: string): Promise<string[]> {
  if (!query || !/^[+\d\s()-]+$/.test(query)) return [];
  let digits = query.replace(/\D/g, '');
  if (!digits) return [];
  if (digits.length === 11 && /^[78]/.test(digits)) digits = digits.slice(1);
  const table = model === 'Client' ? Prisma.sql`"Client"` : Prisma.sql`"Trainer"`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM ${table}
    WHERE strpos(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), ${digits}) > 0
  `);
  return rows.map(row => row.id);
}
