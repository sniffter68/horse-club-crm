import { ForbiddenException, Injectable, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { demoAccounts, requireDemo } from './demo.config';
import { seedDemo } from './demo-seed';

const markerId = 'de000000-9999-4000-8000-000000000001';

@Injectable()
export class DemoService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DEMO_MODE === 'true') await this.initialize();
  }

  async initialize(): Promise<void> {
    requireDemo();
    const passwordHash = await hash(randomBytes(32).toString('hex'), 12);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(86420931)`;
      if (await tx.cashAuditLog.findUnique({ where: { requestId: markerId } })) return;
      // Never adopt an existing operational database just because its name contains demo.
      const counts = await Promise.all([tx.user.count(), tx.client.count(), tx.horse.count(), tx.payment.count(), tx.expense.count()]);
      if (counts.some(count => count > 0)) throw new ForbiddenException('Демо можно инициализировать только в пустой базе');
      // Migrations install empty standard stalls/buildings. Replace that scaffolding with the demo map.
      await tx.stall.deleteMany();
      await tx.stableBuilding.deleteMany();
      await seedDemo(tx, passwordHash);
      await tx.cashAuditLog.create({ data: { requestId: markerId, action: 'DEMO_INITIALIZED',
        actorId: demoAccounts.OWNER.id, actorName: 'Демо-стенд', details: { club: 'КСК Серебряная Подкова' } } });
    }, { timeout: 60000 });
  }

  async reset(actor: { id: string; email: string }): Promise<{ success: true }> {
    requireDemo();
    const passwordHash = await hash(randomBytes(32).toString('hex'), 12);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '10s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(86420931)`;
      if (!await tx.cashAuditLog.findUnique({ where: { requestId: markerId } })) {
        throw new ForbiddenException('База не инициализирована как демо-стенд');
      }
      const tables = Prisma.dmmf.datamodel.models.filter(model => model.name !== 'CashAuditLog')
        .map(model => Prisma.raw(`"${model.dbName ?? model.name}"`));
      await tx.$executeRaw(Prisma.sql`LOCK TABLE ${Prisma.join(tables)} IN ACCESS EXCLUSIVE MODE`);
      // Snapshot every financial record before removal; the independent audit table survives resets.
      const snapshots: Record<string, Prisma.InputJsonValue> = {};
      for (const model of Prisma.dmmf.datamodel.models.filter(model =>
        ['Payment', 'Expense', 'LedgerTransaction', 'MembershipOp', 'Membership', 'CashShift', 'PayrollCalculation',
          'TrainerPayout', 'RevenueRecognition', 'MonthlyFinancialClosing', 'OpeningBalance', 'FinancialPeriodClosing', 'Client'].includes(model.name))) {
        const table = Prisma.raw(`"${model.dbName ?? model.name}"`);
        const rows = await tx.$queryRaw<{ records: Prisma.JsonArray }[]>(Prisma.sql`SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) AS records FROM ${table} t`);
        snapshots[model.name] = rows[0]?.records as Prisma.InputJsonArray ?? [];
      }
      await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'DEMO_RESET', actorId: actor.id,
        actorName: actor.email, details: { createdById: actor.id, timestamp: new Date().toISOString(), snapshots } } });
      // Identifiers come exclusively from the generated schema, never from HTTP input. No CASCADE:
      // an unexpected external FK aborts and rolls back rather than deleting unaudited data.
      await tx.$executeRaw(Prisma.sql`TRUNCATE TABLE ${Prisma.join(tables)}`);
      await seedDemo(tx, passwordHash);
    }, { timeout: 60000 });
    return { success: true };
  }
}
