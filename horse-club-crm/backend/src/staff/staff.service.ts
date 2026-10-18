import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, StaffProfile } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import type { AuthUser } from '../auth/auth.types';
import { CreateShiftDto, PayoutDto, SavePayrollDto, ShiftQueryDto, StaffProfileDto, UpdateShiftDto, UpdateStaffProfileDto } from './staff.dto';

export function payrollDay(value: string): Date {
  const parsed = DateTime.fromISO(value, { zone: 'Europe/Moscow' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !parsed.isValid) throw new BadRequestException('Укажите корректную календарную дату');
  return new Date(`${value}T00:00:00Z`);
}
export function payrollRange(from: string, to: string) {
  const periodStart = payrollDay(from), periodEnd = payrollDay(to);
  if (periodStart > periodEnd || (periodEnd.getTime() - periodStart.getTime()) / 86400000 > 365) throw new BadRequestException('Период должен быть от 1 до 366 дней');
  return { periodStart, periodEnd, start: DateTime.fromISO(from, { zone: 'Europe/Moscow' }).toJSDate(), end: DateTime.fromISO(to, { zone: 'Europe/Moscow' }).plus({ days: 1 }).toJSDate() };
}
const person = { user: { select: { trainerId: true } } } satisfies Prisma.StaffProfileInclude;
const zero = () => new Prisma.Decimal(0);
export function payrollAmounts(shiftsCount: number, profile: Pick<StaffProfile, 'shiftRate' | 'lessonRate' | 'groupLessonRate' | 'lessonPercentage'>, lessons: Array<{ bookings: Array<{ costAmount: Prisma.Decimal }> }>, bonuses: Prisma.Decimal.Value = 0, penalties: Prisma.Decimal.Value = 0) {
  const shiftsTotal = new Prisma.Decimal(profile.shiftRate ?? 0).mul(shiftsCount);
  const lessonsTotal = lessons.reduce((total, lesson) => {
    const rate = lesson.bookings.length > 1 ? profile.groupLessonRate ?? profile.lessonRate : profile.lessonRate;
    const revenue = lesson.bookings.reduce((sum, booking) => sum.plus(booking.costAmount), zero());
    return total.plus(rate ?? 0).plus(revenue.mul(profile.lessonPercentage ?? 0).div(100).toDecimalPlaces(2));
  }, zero());
  return { shiftsCount, shiftsTotal, lessonsCount: lessons.length, lessonsTotal, bonuses: new Prisma.Decimal(bonuses), penalties: new Prisma.Decimal(penalties), totalAmount: shiftsTotal.plus(lessonsTotal).plus(bonuses).minus(penalties).toDecimalPlaces(2) };
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}
  private manage(user: AuthUser) { if (![Role.ADMIN, Role.MANAGER].includes(user.role as 'ADMIN' | 'MANAGER')) throw new ForbiddenException('Доступно администратору и менеджеру'); }
  private async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: 'Serializable' }); }
      catch (error) {
        if (isSerializationFailure(error) && attempt < 4) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Такая запись уже существует');
        throw error;
      }
    }
  }
  private async scope(tx: Prisma.TransactionClient, user: AuthUser, staffId?: string) {
    if (user.role === Role.ADMIN || user.role === Role.MANAGER) return staffId;
    const own = await tx.staffProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (staffId && staffId !== own?.id) throw new ForbiddenException('Чужие начисления и график недоступны');
    return own?.id ?? '00000000-0000-0000-0000-000000000000';
  }
  profiles(user: AuthUser, query: ShiftQueryDto) {
    return this.prisma.$transaction(async tx => {
      const id = await this.scope(tx, user, query.staffId);
      const where = { id };
      return { data: await tx.staffProfile.findMany({ where, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20), take: query.pageSize ?? 20 }), total: await tx.staffProfile.count({ where }) };
    });
  }
  candidates(user: AuthUser) {
    this.manage(user);
    return this.prisma.user.findMany({ where: { staffProfile: null }, select: { id: true, email: true, trainer: { select: { fullName: true, name: true } } }, orderBy: { email: 'asc' }, take: 500 });
  }
  saveProfile(dto: StaffProfileDto | UpdateStaffProfileDto, user: AuthUser, id?: string) {
    this.manage(user);
    if (id && dto.userId !== undefined) throw new BadRequestException('Привязку учетной записи изменить нельзя');
    if (['fullName', 'roleTitle', 'isActive'].some(key => (dto as Record<string, unknown>)[key] === null)) throw new BadRequestException('Обязательные поля не могут быть null');
    return this.atomic(async tx => {
      if (id) {
        if (!await tx.staffProfile.findUnique({ where: { id } })) throw new NotFoundException('Сотрудник не найден');
        return tx.staffProfile.update({ where: { id }, data: dto });
      }
      if (!dto.userId || !await tx.user.findUnique({ where: { id: dto.userId } })) throw new BadRequestException('Учетная запись не найдена');
      return tx.staffProfile.create({ data: dto as StaffProfileDto });
    });
  }
  shifts(query: ShiftQueryDto, user: AuthUser) {
    if (!query.from || !query.to) throw new BadRequestException('Укажите начало и конец периода');
    const range = payrollRange(query.from, query.to);
    return this.prisma.$transaction(async tx => {
      const staffId = await this.scope(tx, user, query.staffId);
      const where = { staffId, date: { gte: range.periodStart, lte: range.periodEnd }, status: query.status };
      return { data: await tx.workShift.findMany({ where, orderBy: [{ date: 'asc' }, { id: 'asc' }], skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 100), take: query.pageSize ?? 100 }), total: await tx.workShift.count({ where }) };
    });
  }
  private async unlocked(tx: Prisma.TransactionClient, staffId: string, start: Date, end: Date) {
    if (await tx.payrollCalculation.findFirst({ where: { staffId, isPaid: true, periodStart: { lte: end }, periodEnd: { gte: start } } })) throw new ConflictException('Период уже оплачен или пересекается с оплаченной ведомостью');
  }
  createShifts(dto: CreateShiftDto, user: AuthUser) {
    this.manage(user);
    if (!!dto.date === !!dto.dates) throw new BadRequestException('Укажите одну дату или список дат');
    if (dto.startTime >= dto.endTime) throw new BadRequestException('Окончание смены должно быть позже начала в тот же день');
    const dates = (dto.dates ?? [dto.date!]).map(payrollDay);
    return this.atomic(async tx => {
      const staff = await tx.staffProfile.findUnique({ where: { id: dto.staffId } });
      if (!staff?.isActive) throw new BadRequestException('Выберите активного сотрудника');
      for (const date of dates) await this.unlocked(tx, dto.staffId, date, date);
      await tx.workShift.createMany({ data: dates.map(date => ({ staffId: dto.staffId, date, startTime: dto.startTime, endTime: dto.endTime, notes: dto.notes, createdById: user.id })) });
      return { count: dates.length };
    });
  }
  changeShift(id: string, dto: UpdateShiftDto | null, user: AuthUser) {
    this.manage(user);
    if (!dto && user.role !== Role.ADMIN) throw new ForbiddenException('Удаление доступно только администратору');
    if (dto && Object.values(dto).some(value => value === null)) throw new BadRequestException('Поля смены не могут быть null');
    return this.atomic(async tx => {
      const shift = await tx.workShift.findUnique({ where: { id } });
      if (!shift) throw new NotFoundException('Смена не найдена');
      await this.unlocked(tx, shift.staffId, shift.date, shift.date);
      if (!dto) return tx.workShift.delete({ where: { id } });
      if ((dto.startTime ?? shift.startTime) >= (dto.endTime ?? shift.endTime)) throw new BadRequestException('Окончание должно быть позже начала');
      if (dto.status === 'COMPLETED' && shift.date.toISOString().slice(0, 10) > DateTime.now().setZone('Europe/Moscow').toISODate()!) throw new BadRequestException('Нельзя завершить будущую смену');
      return tx.workShift.update({ where: { id }, data: dto });
    });
  }
  private async compute(tx: Prisma.TransactionClient, staff: StaffProfile & { user: { trainerId: string | null } }, from: string, to: string, bonuses: Prisma.Decimal.Value = 0, penalties: Prisma.Decimal.Value = 0) {
    const range = payrollRange(from, to);
    const count = await tx.workShift.count({ where: { staffId: staff.id, status: 'COMPLETED', date: { gte: range.periodStart, lte: range.periodEnd } } });
    // Completing a Lesson does not change participant Booking.status in the schedule module.
    const lessons = staff.user.trainerId ? await tx.lesson.findMany({ where: { trainerId: staff.user.trainerId, status: 'COMPLETED', startTime: { gte: range.start, lt: range.end } }, select: { bookings: { where: { status: { in: ['scheduled', 'completed'] } }, select: { costAmount: true } } } }) : [];
    return payrollAmounts(count, staff, lessons, bonuses, penalties);
  }
  calculate(query: ShiftQueryDto, user: AuthUser) {
    if (!query.from || !query.to) throw new BadRequestException('Укажите период расчета');
    const { periodStart, periodEnd } = payrollRange(query.from, query.to);
    return this.prisma.$transaction(async tx => {
      const id = await this.scope(tx, user, query.staffId);
      const where = { id };
      const staff = await tx.staffProfile.findMany({ where, include: person, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20), take: query.pageSize ?? 20 });
      const data = [];
      for (const profile of staff) {
        const saved = await tx.payrollCalculation.findUnique({ where: { staffId_periodStart_periodEnd: { staffId: profile.id, periodStart, periodEnd } } });
        const overlap = await tx.payrollCalculation.findFirst({ where: { staffId: profile.id, isPaid: true, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } } });
        data.push({ ...saved, ...(saved?.isPaid ? {} : await this.compute(tx, profile, query.from!, query.to!, saved?.bonuses, saved?.penalties)), staffId: profile.id, fullName: profile.fullName, roleTitle: profile.roleTitle, isPaid: saved?.isPaid ?? false, blocked: !!overlap && !saved?.isPaid });
      }
      return { data, total: await tx.staffProfile.count({ where }) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  savePayroll(dto: SavePayrollDto, user: AuthUser) {
    this.manage(user);
    const { periodStart, periodEnd } = payrollRange(dto.from, dto.to);
    return this.atomic(async tx => {
      await this.unlocked(tx, dto.staffId, periodStart, periodEnd);
      const previous = await tx.payrollCalculation.findUnique({ where: { staffId_periodStart_periodEnd: { staffId: dto.staffId, periodStart, periodEnd } } });
      if (dto.expectedUpdatedAt !== undefined && (previous?.updatedAt.toISOString() ?? null) !== dto.expectedUpdatedAt) throw new ConflictException('Расчет изменен другим пользователем. Обновите ведомость');
      const staff = await tx.staffProfile.findUnique({ where: { id: dto.staffId }, include: person });
      if (!staff) throw new NotFoundException('Сотрудник не найден');
      const amounts = await this.compute(tx, staff, dto.from, dto.to, dto.bonuses, dto.penalties);
      if (amounts.totalAmount.isNegative() || [amounts.totalAmount, amounts.shiftsTotal, amounts.lessonsTotal].some(value => value.gt('9999999999.99'))) throw new BadRequestException('Суммы расчета должны быть от 0 до 9 999 999 999,99 ₽');
      return tx.payrollCalculation.upsert({ where: { staffId_periodStart_periodEnd: { staffId: staff.id, periodStart, periodEnd } }, create: { staffId: staff.id, periodStart, periodEnd, ...amounts, createdById: user.id }, update: amounts });
    });
  }
  payout(dto: PayoutDto, user: AuthUser) {
    this.manage(user);
    return this.atomic(async tx => {
      const row = await tx.payrollCalculation.findUnique({ where: { id: dto.calculationId }, include: { staff: { include: person }, expense: true } });
      if (!row) throw new NotFoundException('Ведомость не найдена');
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${row.staffId}, 0))::text`;
      if (row.isPaid) {
        if (row.expense?.paymentMethod !== dto.paymentMethod || !row.totalAmount.equals(dto.expectedTotal)) throw new ConflictException('Ведомость уже выплачена с другими параметрами');
        return row;
      }
      await this.unlocked(tx, row.staffId, row.periodStart, row.periodEnd);
      const from = row.periodStart.toISOString().slice(0, 10), to = row.periodEnd.toISOString().slice(0, 10);
      const amounts = await this.compute(tx, row.staff, from, to, row.bonuses, row.penalties);
      if (!amounts.totalAmount.equals(dto.expectedTotal) || !row.totalAmount.equals(dto.expectedTotal)) throw new ConflictException('Начисления изменились. Обновите и сохраните расчет перед выплатой');
      if (amounts.totalAmount.lte(0)) throw new BadRequestException('Сумма выплаты должна быть положительной');
      const paidAt = new Date();
      const shift = await tx.cashShift.findFirst({ where: { cashierId: user.id, closedAt: null, openedAt: { lte: paidAt } } });
      const expense = await tx.expense.create({ data: { category: 'SALARY', amount: amounts.totalAmount, paymentMethod: dto.paymentMethod, description: `Выплата зарплаты: ${row.staff.fullName}, период ${from}–${to}`, createdById: user.id, date: paidAt, shiftId: shift?.id } });
      // FinanceService derives balances from Expense in the same database; no duplicate balance cache.
      return tx.payrollCalculation.update({ where: { id: row.id }, data: { ...amounts, isPaid: true, paidAt, expenseId: expense.id } });
    });
  }
}
