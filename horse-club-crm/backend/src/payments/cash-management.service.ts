import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { isSerializationFailure } from '../common/serialization-failure';
import { PrismaService } from '../prisma/prisma.service';
import { ResetCashDto, WithdrawCashDto } from './dto/cash-management.dto';

@Injectable()
export class CashManagementService {
  constructor(private readonly prisma: PrismaService) {}

  private authorize(user: AuthUser) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Управление кассой доступно только владельцу (ADMIN)');
  }

  private async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: 'Serializable' }); }
      catch (error) { if (isSerializationFailure(error) && attempt < 4) continue; throw error; }
    }
  }

  reset(dto: ResetCashDto, user: AuthUser) {
    this.authorize(user);
    if (dto.confirmation !== 'RESET_CASH') throw new BadRequestException('Требуется подтверждение RESET_CASH');
    const requestId = dto.requestId ?? randomUUID();
    return this.atomic(async tx => {
      // Blocks concurrent writers for a consistent reset boundary, including legacy APIs.
      await tx.$executeRaw`LOCK TABLE "Payment", "Expense", "CashShift" IN EXCLUSIVE MODE`;
      const previous = await tx.cashAuditLog.findUnique({ where: { requestId } });
      if (previous && (previous.action !== 'RESET_CASH' || previous.actorId !== user.id)) throw new ConflictException('Ключ операции уже использован');
      if (!previous) {
        const now = new Date();
        // Archive rather than delete: preserve ledger, lesson, membership and payroll FKs/statuses.
        const payments = await tx.payment.updateMany({ where: { archivedAt: null }, data: { archivedAt: now } });
        const expenses = await tx.expense.updateMany({ where: { archivedAt: null }, data: { archivedAt: now } });
        await tx.cashShift.updateMany({ where: { archivedAt: null, closedAt: null }, data: { closedAt: now } });
        const shifts = await tx.cashShift.updateMany({ where: { archivedAt: null }, data: { archivedAt: now } });
        const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { staffProfile: true } });
        await tx.cashAuditLog.create({ data: { requestId, action: 'RESET_CASH', actorId: user.id,
          actorName: actor.staffProfile?.fullName || actor.email,
          details: { message: `Касса обнулена пользователем ${user.id}, ${actor.staffProfile?.fullName || actor.email}`,
            payments: payments.count, expenses: expenses.count, shifts: shifts.count },
        } });
      }
      return { success: true, message: 'Касса и история операций успешно обнулены', currentBalance: 0 };
    });
  }

  withdraw(dto: WithdrawCashDto, user: AuthUser) {
    this.authorize(user);
    if (!Number.isFinite(dto.amount) || dto.amount <= 0 || new Prisma.Decimal(dto.amount).decimalPlaces() > 2) throw new BadRequestException('Введите положительную сумму с точностью до копеек');
    return this.atomic(async tx => {
      // Same table order as reset. Prevent overdrafts across concurrent withdrawals/expenses.
      await tx.$executeRaw`LOCK TABLE "Payment", "Expense", "CashShift" IN EXCLUSIVE MODE`;
      const previous = await tx.expense.findUnique({ where: { requestId: dto.requestId } });
      if (previous) {
        if (!previous.isEncashment || previous.createdById !== user.id || !previous.amount.equals(dto.amount)) throw new ConflictException('Ключ операции уже использован');
        return previous;
      }
      const income = await tx.payment.aggregate({ where: { archivedAt: null, status: 'PAID', method: 'CASH' }, _sum: { amount: true } });
      const expenses = await tx.expense.aggregate({ where: { archivedAt: null, cancelledAt: null, paymentMethod: 'CASH' }, _sum: { amount: true } });
      const balance = new Prisma.Decimal(income._sum.amount ?? 0).minus(expenses._sum.amount ?? 0);
      if (balance.lt(dto.amount)) throw new BadRequestException('Недостаточно наличных в кассе');
      const shift = await tx.cashShift.findFirst({ where: { cashierId: user.id, closedAt: null, archivedAt: null } });
      const expense = await tx.expense.create({ data: { requestId: dto.requestId, amount: dto.amount, paymentMethod: 'CASH', category: 'OTHER',
        isEncashment: true, description: 'Передача выручки владельцу', createdById: user.id, shiftId: shift?.id } });
      await tx.cashAuditLog.create({ data: { requestId: dto.requestId, action: 'WITHDRAW_CASH', actorId: user.id, actorName: user.email,
        details: { expenseId: expense.id, amount: new Prisma.Decimal(dto.amount).toFixed(2), balanceAfter: balance.minus(dto.amount).toFixed(2) } } });
      return expense;
    });
  }
}
