import { hash } from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { BCRYPT_ROUNDS } from '../auth/auth.config';
import { VkIdentityService } from '../vk-bot/vk-identity.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, StaffProfile } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import type { AuthUser } from '../auth/auth.types';
import { StaffQueryDto, CreateShiftDto, PayoutDto, SavePayrollDto, ShiftQueryDto, StaffProfileDto, UpdateShiftDto, UpdateStaffProfileDto } from './staff.dto';

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
  constructor(private readonly prisma: PrismaService, private readonly identity: VkIdentityService = new VkIdentityService(prisma)) {}
  private manage(user: AuthUser) { if (![Role.ADMIN, Role.MANAGER].includes(user.role as 'ADMIN' | 'MANAGER')) throw new ForbiddenException('Доступно администратору и менеджеру'); }
  private async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: 'Serializable' }); }
      catch (error) {
        if (isSerializationFailure(error) && attempt < 4) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          if (String(error.meta?.target).includes('vk')) throw new ConflictException('Этот VK ID уже привязан к другому клиенту или сотруднику');
          throw new ConflictException('Такая запись уже существует');
        }
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
  profiles(user: AuthUser, query: StaffQueryDto) {
    return this.prisma.$transaction(async tx => {
      const id = await this.scope(tx, user, query.staffId);
      const where: Prisma.StaffProfileWhereInput = { id, user: query.role ? { role: query.role } : undefined,
        isActive: query.activity ? query.activity === 'active' : undefined,
        ...(query.duty ? { shifts: query.duty === 'on' ? { some: this.dutyWhere() } : { none: this.dutyWhere() } } : {}) };

      return { data: await tx.staffProfile.findMany({ where, include: { user: { select: { vkId: true, role: true, email: true, trainerId: true, crmAccess: true } }, shifts: { where: this.dutyWhere(), select: { id: true } } }, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20), take: query.pageSize ?? 20 }), total: await tx.staffProfile.count({ where }) };
    });
  }
  candidates(user: AuthUser) {
    this.manage(user);
    return this.prisma.user.findMany({ where: { staffProfile: null, ...(user.role !== Role.ADMIN ? { role: { not: Role.ADMIN } } : {}) }, select: { id: true, role: true, email: true, vkId: true, trainer: { select: { fullName: true, name: true } } }, orderBy: { email: 'asc' }, take: 500 });
  }
  async saveProfile(dto: StaffProfileDto | UpdateStaffProfileDto, user: AuthUser, id?: string) {
    this.manage(user);
    if (id && dto.userId !== undefined) throw new BadRequestException('Привязку учетной записи изменить нельзя');
    if (['fullName', 'roleTitle', 'position', 'role', 'isActive', 'createCrmAccess'].some(key => (dto as Record<string, unknown>)[key] === null)) throw new BadRequestException('Обязательные поля не могут быть null');
    if (dto.role === Role.ADMIN && user.role !== Role.ADMIN) throw new ForbiddenException('Назначать администратора может только администратор');
    const { vkId, vkScreenName, email, role, position, createCrmAccess, temporaryPassword, ...profile } = dto;
    const input = vkId !== undefined ? vkId : vkScreenName;
    const normalized = input !== undefined ? await this.identity.normalize(input) : undefined;
    const access = createCrmAccess ?? !!temporaryPassword;
    if (!id && !dto.userId && !role) throw new BadRequestException('Выберите роль сотрудника');
    if (access && !id && !dto.userId && (!email || !temporaryPassword)) throw new BadRequestException('Для доступа в CRM укажите email и временный пароль');
    if (temporaryPassword && Buffer.byteLength(temporaryPassword, 'utf8') > 72) throw new BadRequestException('Пароль должен быть не длиннее 72 байт UTF-8');
    const passwordHash = temporaryPassword ? await hash(temporaryPassword, BCRYPT_ROUNDS) : undefined;
    return this.atomic(async tx => {
      const previous = id ? await tx.staffProfile.findUnique({ where: { id } }) : null;
      if (id && !previous) throw new NotFoundException('Сотрудник не найден');
      let account = previous || dto.userId ? await tx.user.findUnique({ where: { id: previous?.userId ?? dto.userId } }) : null;
      if ((previous || dto.userId) && !account) throw new BadRequestException('Учетная запись не найдена');
      if (account?.role === Role.ADMIN && user.role !== Role.ADMIN) throw new ForbiddenException('Изменять администратора может только администратор');
      if (account?.id === user.id && (role && role !== account.role || dto.isActive === false || createCrmAccess === false)) throw new BadRequestException('Нельзя отключить собственный доступ');
      if (!account) account = await tx.user.create({ data: { email: email?.trim().toLowerCase() ?? `staff-${randomUUID()}@staff.invalid`, passwordHash: passwordHash ?? await hash(randomUUID(), BCRYPT_ROUNDS), role: role!, crmAccess: access } });
      if (account.crmAccess === false && createCrmAccess && !passwordHash) throw new BadRequestException('Укажите временный пароль для включения доступа');
      if (createCrmAccess && (email ?? account.email).endsWith('@staff.invalid')) throw new BadRequestException('Для доступа в CRM укажите email сотрудника');
      const nextRole = role ?? account.role;
      const active = dto.isActive ?? previous?.isActive ?? true;
      const fullName = dto.fullName ?? previous!.fullName;
      let trainerId = account.trainerId;
      if (nextRole === Role.TRAINER && !trainerId) trainerId = (await tx.trainer.create({ data: { fullName, name: fullName, phone: dto.phone || undefined, scheduleColor: dto.scheduleColor, isActive: active, isPublic: false } })).id;
      if (trainerId) await tx.trainer.update({ where: { id: trainerId }, data: { fullName, name: fullName, ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}), ...(dto.scheduleColor !== undefined ? { scheduleColor: dto.scheduleColor } : {}), isActive: active && nextRole === Role.TRAINER } });
      const accessChanged = createCrmAccess !== undefined && createCrmAccess !== account.crmAccess;
      await tx.user.update({ where: { id: account.id }, data: { role: nextRole, trainerId, ...(email !== undefined ? { email: email.trim().toLowerCase() } : {}), ...(passwordHash ? { passwordHash } : {}), ...(!active ? { crmAccess: false } : createCrmAccess !== undefined ? { crmAccess: createCrmAccess } : {}), ...(nextRole !== account.role || !active || accessChanged || passwordHash ? { tokenVersion: { increment: 1 } } : {}) } });
      if (normalized) await this.identity.applyStaff(tx, account.id, normalized.vkId);
      const data = { ...profile, userId: account.id, fullName, roleTitle: position ?? dto.roleTitle ?? previous?.roleTitle ?? nextRole };
      if (!active && id) await tx.workShift.updateMany({ where: { staffId: id, startedAt: { not: null }, endedAt: null }, data: { endedAt: new Date(), endedById: user.id } });
      return id ? tx.staffProfile.update({ where: { id }, data }) : tx.staffProfile.create({ data });
    });
  }
  archive(id: string, user: AuthUser) { return this.saveProfile({ isActive: false }, user, id); }

  dutyWhere(now = new Date()): Prisma.WorkShiftWhereInput {
    const local = DateTime.fromJSDate(now, { zone: 'Europe/Moscow' });
    return { date: payrollDay(local.toISODate()!), startedAt: { lte: now }, endedAt: null, status: 'SCHEDULED', staff: { isActive: true } };
  }
  today(user: AuthUser) {
    return this.prisma.$transaction(async tx => {
      const staffId = await this.scope(tx, user);
      return tx.workShift.findMany({ where: { ...this.dutyWhere(), staffId }, include: { staff: { select: { fullName: true, roleTitle: true } } }, orderBy: { startTime: 'asc' } });
    });
  }
  duty(action: 'start' | 'end', staffId: string | undefined, user: AuthUser, now = new Date()) {
    return this.atomic(async tx => {
      const own = await tx.staffProfile.findUnique({ where: { userId: user.id } });
      const targetId = staffId ?? own?.id;
      if (!targetId) throw new BadRequestException('Профиль сотрудника не найден');
      if (targetId !== own?.id && user.role !== Role.ADMIN) throw new ForbiddenException('Чужую смену может менять только администратор');
      const staff = await tx.staffProfile.findUnique({ where: { id: targetId } });
      if (!staff?.isActive) throw new BadRequestException('Выберите активного сотрудника');
      const local = DateTime.fromJSDate(now, { zone: 'Europe/Moscow' });
      const date = payrollDay(local.toISODate()!);
      await this.unlocked(tx, targetId, date, date);
      const shift = await tx.workShift.findUnique({ where: { staffId_date: { staffId: targetId, date } } });
      if (action === 'start') {
        if (shift?.endedAt || shift && shift.status !== 'SCHEDULED') throw new ConflictException('Смена уже закрыта или отмечена нерабочей');
        if (shift?.startedAt) return shift;
        const data = { startedAt: now, startTime: local.toFormat('HH:mm') };
        return shift ? tx.workShift.update({ where: { id: shift.id }, data }) : tx.workShift.create({ data: { ...data, staffId: targetId, date, endTime: '23:59', createdById: user.id } });
      }
      if (!shift?.startedAt) throw new ConflictException('Сначала откройте смену');
      if (shift.endedAt) return shift;
      return tx.workShift.update({ where: { id: shift.id }, data: { endedAt: now, endedById: user.id, endTime: local.toFormat('HH:mm'), status: 'COMPLETED' } });
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
