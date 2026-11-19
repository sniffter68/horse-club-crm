import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TrainerPayoutType } from '@prisma/client';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { GenerateTrainerStatementDto, TrainerStatementQueryDto } from './trainer-payout.dto';
import { payrollRange } from './staff.service';

const zone = 'Europe/Moscow';
const include = { trainer: { select: { id: true, name: true, fullName: true } }, staff: { select: { fullName: true } } } satisfies Prisma.TrainerPayoutInclude;
export function statementPeriod(dto: GenerateTrainerStatementDto) {
  const month = DateTime.fromISO(`${dto.month}-01`, { zone });
  if (!month.isValid || month.year < 2000) throw new BadRequestException('Некорректный месяц');
  const from = dto.periodStart ?? month.toISODate()!;
  const to = dto.periodEnd ?? (dto.type === 'ADVANCE' ? month.set({ day: 15 }) : month.endOf('month')).toISODate()!;
  const range = payrollRange(from, to);
  if (!from.startsWith(dto.month) || !to.startsWith(dto.month)) throw new BadRequestException('Период должен входить в выбранный месяц');
  if (dto.type === 'FINAL_SALARY' && (from !== month.toISODate() || to !== month.endOf('month').toISODate())) throw new BadRequestException('Зарплата рассчитывается за полный месяц');
  return range;
}

@Injectable()
export class TrainerPayoutService {
  constructor(private readonly prisma: PrismaService) {}
  private async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 20000 }); }
      catch (error) {
        if (isSerializationFailure(error) && attempt < 4) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ведомость уже существует. Обновите список');
        throw error;
      }
    }
  }
  list(dto: TrainerStatementQueryDto) {
    return this.prisma.trainerPayout.findMany({ where: { month: dto.month }, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
  }
  private async compute(tx: Prisma.TransactionClient, trainerId: string, dto: GenerateTrainerStatementDto) {
    const range = statementPeriod(dto);
    const legacy = await tx.payrollCalculation.findFirst({ where: { staff: { user: { trainerId } }, isPaid: true, periodStart: { lte: range.periodEnd }, periodEnd: { gte: range.periodStart } } });
    if (legacy) throw new ConflictException('Период уже оплачен в ведомости персонала');
    const paid = await tx.trainerPayout.findMany({ where: { OR: [{ trainerId }, { trainerId: null, staff: { user: { trainerId } } }], month: dto.month, status: 'PAID' } });
    if (paid.some(row => row.type === 'FINAL_SALARY' || (dto.type === 'ADVANCE' && row.periodStart <= range.periodEnd && row.periodEnd >= range.periodStart))) throw new ConflictException('Период уже оплачен');
    const lessons = await tx.lesson.findMany({ where: { trainerId, deletedAt: null, status: 'COMPLETED', startTime: { gte: range.start, lt: range.end } },
      select: { id: true, startTime: true, service: { select: { name: true, price: true } } }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }] });
    if (lessons.some(row => !row.service)) throw new ConflictException('У проведённого занятия не указана услуга');
    const lessonBreakdown = lessons.map(row => ({ id: row.id, startTime: row.startTime.toISOString(), serviceName: row.service!.name,
      nominalPrice: row.service!.price.toFixed(2), trainerPayout: row.service!.price.mul('0.30').toDecimalPlaces(2).toFixed(2) }));
    const nominalBase = lessonBreakdown.reduce((sum, row) => sum.plus(row.nominalPrice), new Prisma.Decimal(0));
    const accrued = lessonBreakdown.reduce((sum, row) => sum.plus(row.trainerPayout), new Prisma.Decimal(0));
    const advanceDeducted = dto.type === 'FINAL_SALARY' ? paid.reduce((sum, row) => sum.plus(row.totalAmount), new Prisma.Decimal(0)) : new Prisma.Decimal(0);
    if (accrued.lt(advanceDeducted)) throw new ConflictException('Выплаченные авансы превышают начисления. Требуется сверка');
    return { lessonsCount: lessons.length, nominalBase, accrued, advanceDeducted, totalAmount: accrued.minus(advanceDeducted), lessonBreakdown };
  }
  generate(dto: GenerateTrainerStatementDto, actor: { id: string; email: string }) {
    const range = statementPeriod(dto);
    return this.atomic(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(6842026)::text`;
      await tx.$queryRaw`SELECT assert_payroll_month_open(${range.periodStart}::date, ${range.periodEnd}::date)::text`;
      const trainers = await tx.trainer.findMany({ where: { id: dto.trainerId, isActive: true,
        ...(dto.staffId ? { user: { staffProfile: { id: dto.staffId } } } : {}),
        lessons: { some: { deletedAt: null, status: 'COMPLETED', startTime: { gte: range.start, lt: range.end } } } }, orderBy: { id: 'asc' } });
      const rows = [];
      for (const trainer of trainers) {
        const unresolved = await tx.trainerPayout.findFirst({ where: { trainerId: null, staff: { user: { trainerId: trainer.id } } } });
        if (unresolved) throw new ConflictException('Исторические ведомости требуют сверки привязки тренера');
        const key = { trainerId: trainer.id, type: dto.type, periodStart: range.periodStart, periodEnd: range.periodEnd };
        const previous = await tx.trainerPayout.findUnique({ where: { trainerId_type_periodStart_periodEnd: key } });
        if (previous?.status === 'PAID') { rows.push(previous); continue; }
        const amounts = await this.compute(tx, trainer.id, dto);
        rows.push(await tx.trainerPayout.upsert({ where: { trainerId_type_periodStart_periodEnd: key }, create: { ...key, month: dto.month, ...amounts, createdById: actor.id }, update: { ...amounts, status: 'DRAFT' }, include }));
      }
      await this.audit(tx, 'TRAINER_STATEMENTS_GENERATED', actor, { month: dto.month, type: dto.type });
      return rows;
    });
  }
  transition(id: string, pay: boolean, actor: { id: string; email: string }) {
    return this.atomic(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(6842026)::text`;
      const row = await tx.trainerPayout.findUnique({ where: { id }, include });
      if (!row) throw new NotFoundException('Ведомость не найдена');
      if (row.status === 'PAID' || (!pay && row.status === 'APPROVED')) return row;
      if (pay && row.status !== 'APPROVED') throw new ConflictException('Сначала утвердите ведомость');
      if (!row.trainerId) throw new ConflictException('Историческая ведомость требует привязки тренера');
      const amounts = await this.compute(tx, row.trainerId, { month: row.month, type: row.type as TrainerPayoutType, periodStart: row.periodStart.toISOString().slice(0, 10), periodEnd: row.periodEnd.toISOString().slice(0, 10) });
      if (!row.totalAmount.equals(amounts.totalAmount) || !row.accrued.equals(amounts.accrued) || !row.advanceDeducted.equals(amounts.advanceDeducted) || !isDeepStrictEqual(row.lessonBreakdown, amounts.lessonBreakdown)) throw new ConflictException('Начисления изменились. Сформируйте ведомость заново');
      const paidAt = new Date();
      const expense = pay && row.totalAmount.gt(0) ? await tx.expense.create({ data: { amount: row.totalAmount, category: 'SALARY', paymentMethod: 'CASH', date: paidAt, createdById: actor.id,
        description: `${row.type === 'ADVANCE' ? 'Аванс' : 'Зарплата'}: ${row.trainer?.name || row.trainer?.fullName || row.staff?.fullName}, ${row.month}` } }) : null;
      const result = await tx.trainerPayout.update({ where: { id }, data: { status: pay ? 'PAID' : 'APPROVED', ...(pay ? { paidAt, expenseId: expense?.id } : {}) }, include });
      await this.audit(tx, pay ? 'TRAINER_STATEMENT_PAID' : 'TRAINER_STATEMENT_APPROVED', actor, { statementId: id, amount: row.totalAmount.toFixed(2), cashbox: 'MAIN', expenseId: expense?.id ?? null });
      return result;
    });
  }
  private audit(tx: Prisma.TransactionClient, action: string, actor: { id: string; email: string }, details: Prisma.InputJsonObject) {
    return tx.cashAuditLog.create({ data: { requestId: randomUUID(), action, actorId: actor.id, actorName: actor.email, details } });
  }
}
