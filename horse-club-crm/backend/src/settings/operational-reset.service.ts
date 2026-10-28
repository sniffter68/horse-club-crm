import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResetOperationalDataDto } from './reset-operational-data.dto';

@Injectable()
export class OperationalResetService {
  constructor(private readonly prisma: PrismaService) {}

  async reset(dto: ResetOperationalDataDto, user: AuthUser) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Сброс доступен только администратору');
    if (dto.confirmation !== 'RESET_ALL_OPERATIONAL_DATA') throw new BadRequestException('Введите RESET_ALL_OPERATIONAL_DATA');
    const requestId = dto.requestId ?? randomUUID();
    return this.prisma.$transaction(async tx => {
      // Same leading lock order as cash-management. Block legacy writers as well.
      // READ COMMITTED reads the latest committed state after acquiring these locks.
      await tx.$executeRaw`SET LOCAL lock_timeout = '10s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(6842026)`;
      await tx.$executeRaw`LOCK TABLE "Payment", "Expense", "CashShift",
        "MonthlyFinancialClosing", "PayrollCalculation", "LedgerTransaction",
        "RevenueRecognition", "MembershipOp", "BookingHorseChange", "Booking",
        "Lesson", "MembershipMember", "Membership", "Client" IN EXCLUSIVE MODE`;
      const previous = await tx.cashAuditLog.findUnique({ where: { requestId } });
      if (previous) {
        if (previous.action !== 'RESET_ALL_OPERATIONAL_DATA' || previous.actorId !== user.id)
          throw new ConflictException('Ключ операции уже использован');
        return { success: true, auditId: previous.id, alreadyCompleted: true };
      }
      const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { staffProfile: true } });
      // Preserve the financial evidence before hard deletion, in the SAME transaction.
      const snapshot = {
        payments: await tx.payment.findMany(),
        expenses: await tx.expense.findMany(),
        ledger: await tx.ledgerTransaction.findMany(),
        payroll: await tx.payrollCalculation.findMany(),
        monthlyClosings: await tx.monthlyFinancialClosing.findMany({ include: { openingBalance: true } }),
        revenue: await tx.revenueRecognition.findMany(),
        memberships: await tx.membership.findMany(),
        cashShifts: await tx.cashShift.findMany(),
        clientBalances: await tx.client.findMany({ select: { id: true, boardingBalance: true } }),
      };
      // The DB exception for immutable snapshots requires this audit to have
      // been inserted in the current transaction. It rolls back with any failure.
      const audit = await tx.cashAuditLog.create({ data: {
        requestId, action: 'RESET_ALL_OPERATIONAL_DATA', actorId: user.id,
        actorName: actor.staffProfile?.fullName || actor.email,
        details: JSON.parse(JSON.stringify({ createdById: user.id, timestamp: new Date().toISOString(),
          snapshot })) as Prisma.InputJsonValue,
      } });
      await tx.$queryRaw`SELECT set_config('horsecrm.operational_reset_id', ${requestId}, true)`;
      const deleted: Record<string, number> = {};
      deleted.monthlyFinancialClosing = (await tx.monthlyFinancialClosing.deleteMany()).count;
      deleted.payrollCalculation = (await tx.payrollCalculation.deleteMany()).count;
      // Ledger holds RESTRICT links to membership operations and bookings.
      deleted.ledgerTransaction = (await tx.ledgerTransaction.deleteMany()).count;
      deleted.revenueRecognition = (await tx.revenueRecognition.deleteMany()).count;
      deleted.membershipOp = (await tx.membershipOp.deleteMany()).count;
      deleted.bookingHorseChange = (await tx.bookingHorseChange.deleteMany()).count;
      deleted.booking = (await tx.booking.deleteMany()).count;
      deleted.lesson = (await tx.lesson.deleteMany()).count;
      deleted.membershipMember = (await tx.membershipMember.deleteMany()).count;
      deleted.membership = (await tx.membership.deleteMany()).count;
      // Refunds are Expense records referencing Payment with RESTRICT.
      deleted.expense = (await tx.expense.deleteMany()).count;
      deleted.payment = (await tx.payment.deleteMany()).count;
      // SET NULL payment links can recognize one-off revenue; deleting boarding
      // receipts can project reversal ledger entries. Clear those trigger outputs too.
      deleted.ledgerTransaction += (await tx.ledgerTransaction.deleteMany()).count;
      deleted.revenueRecognition += (await tx.revenueRecognition.deleteMany()).count;
      deleted.cashShift = (await tx.cashShift.deleteMany()).count;
      // Cash/card/client lesson balances are derived from the deleted financial rows.
      const clients = await tx.client.updateMany({ data: { boardingBalance: new Prisma.Decimal(0) } });
      return { success: true, auditId: audit.id, deleted, clientsReset: clients.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 60_000 });
  }
}
