import { lessonPay, type TrainerPay } from './trainer-pay';
import { hash } from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { BCRYPT_ROUNDS } from '../auth/auth.config';
import { VkIdentityService } from '../vk-bot/vk-identity.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, StaffProfile, WorkShiftStatus } from '@prisma/client';
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
const person = { user: { select: { trainerId: true, trainer: { select: { commissionPercent: true, payScheme: true, fixedPay: true } } } } } satisfies Prisma.StaffProfileInclude;
const zero = () => new Prisma.Decimal(0);
type PayrollLesson = { trainer?: TrainerPay | null; id?: string; startTime?: Date; service?: { price: Prisma.Decimal; name?: string } | null; bookings: Array<{ costAmount: Prisma.Decimal }> };
export function trainerPayout(lesson: PayrollLesson): number {
  // Preserve the established whole-ruble rounding of legacy staff payrolls.
  return lessonPay(lesson.service?.price ?? 0, lesson.trainer ?? {}).toDecimalPlaces(0).toNumber();
}
export function payrollAmounts(shiftsCount: number, profile: Pick<StaffProfile, 'shiftRate' | 'lessonRate' | 'groupLessonRate' | 'lessonPercentage'>, lessons: PayrollLesson[], bonuses: Prisma.Decimal.Value = 0, penalties: Prisma.Decimal.Value = 0) {
  const shiftsTotal = new Prisma.Decimal(profile.shiftRate ?? 0).mul(shiftsCount);
  const lessonsTotal = lessons.reduce((total, lesson) => {
    const rate = lesson.bookings.length > 1 ? profile.groupLessonRate ?? profile.lessonRate : profile.lessonRate;
    return total.plus(!lesson.trainer?.payScheme || lesson.trainer.payScheme === 'LEGACY' ? rate ?? 0 : 0).plus(trainerPayout(lesson));
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
      const where: Prisma.StaffProfileWhereInput = { id, user: query.group === 'stable' ? { role: { in: [Role.STABLE_WORKER, Role.GROOM, Role.VET, Role.OTHER] } } : query.role ? { role: query.role } : undefined,
        isActive: query.activity ? query.activity === 'active' : undefined,
        ...(query.duty ? { shifts: query.duty === 'on' ? { some: this.dutyWhere() } : { none: this.dutyWhere() } } : {}) };

      return { data: await tx.staffProfile.findMany({ where, include: { user: { select: { telegramUserId: true, telegramUsername: true, vkId: true, role: true, email: true, trainerId: true, trainer: { select: { commissionPercent: true, payScheme: true, fixedPay: true, isPublic: true, imageUrl: true, description: true, allowIndividual: true, allowGroup: true, allowWalk: true, allowSpecial: true } }, crmAccess: true } }, shifts: { where: this.dutyWhere(), select: { id: true } } }, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20), take: query.pageSize ?? 20 }), total: await tx.staffProfile.count({ where }) };
    });
  }
  candidates(user: AuthUser) {
    this.manage(user);
    return this.prisma.user.findMany({ where: { staffProfile: null, ...(user.role !== Role.ADMIN ? { role: { not: Role.ADMIN } } : {}) }, select: { id: true, role: true, email: true, crmAccess: true, vkId: true, trainer: { select: { id: true, fullName: true, name: true, phone: true, isPublic: true, imageUrl: true, description: true, payScheme: true, fixedPay: true, commissionPercent: true, allowIndividual: true, allowGroup: true, allowWalk: true, allowSpecial: true } } }, orderBy: { email: 'asc' }, take: 500 });
  }
  async saveProfile(dto: StaffProfileDto | UpdateStaffProfileDto, user: AuthUser, id?: string) {
    this.manage(user);
    if (id && dto.userId !== undefined) throw new BadRequestException('Привязку учетной записи изменить нельзя');
    if (['fullName', 'roleTitle', 'position', 'role', 'email', 'isActive', 'createCrmAccess', 'hasCrmAccess', 'isPublic', 'payScheme', 'commissionPercent', 'fixedPay', 'allowIndividual', 'allowGroup', 'allowWalk', 'allowSpecial'].some(key => (dto as Record<string, unknown>)[key] === null)) throw new BadRequestException('Обязательные поля не могут быть null');
    if (dto.role === Role.ADMIN && user.role !== Role.ADMIN) throw new ForbiddenException('Назначать администратора может только администратор');
    const { hasCrmAccess, isPublic, imageUrl, description, payScheme, commissionPercent, fixedPay, vkId, vkScreenName, email, role, position, createCrmAccess: legacyAccess, temporaryPassword, trainerId: selectedTrainerId, allowIndividual, allowGroup, allowWalk, allowSpecial, ...profile } = dto;
    if (hasCrmAccess !== undefined && legacyAccess !== undefined && hasCrmAccess !== legacyAccess) throw new BadRequestException('Противоречивые настройки доступа');
    const createCrmAccess = hasCrmAccess ?? legacyAccess;
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
      if (account.crmAccess === false && account.email.endsWith('@staff.invalid') && createCrmAccess && !passwordHash) throw new BadRequestException('Укажите временный пароль для включения доступа');
      if (createCrmAccess && (email ?? account.email).endsWith('@staff.invalid')) throw new BadRequestException('Для доступа в CRM укажите email сотрудника');
      const nextRole = role ?? account.role;
      const active = dto.isActive ?? previous?.isActive ?? true;
      if (!active && createCrmAccess === true) throw new BadRequestException('Сначала восстановите сотрудника из архива');
      if (account.role === Role.ADMIN && account.crmAccess && (!active || createCrmAccess === false || nextRole !== Role.ADMIN)) {
        const remaining = await tx.user.count({ where: { id: { not: account.id }, role: Role.ADMIN, crmAccess: true,
          OR: [{ staffProfile: null }, { staffProfile: { isActive: true } }] } });
        if (!remaining) throw new BadRequestException('Нельзя отключить доступ или изменить роль последнего активного администратора');
      }
      const directions = { allowIndividual, allowGroup, allowWalk, allowSpecial };
      const trainerFields = { ...directions, isPublic, imageUrl, description, payScheme, commissionPercent, fixedPay };
      if (payScheme === 'PERCENT' && commissionPercent === undefined) throw new BadRequestException('Укажите процент от занятия');
      if (payScheme === 'FIXED' && fixedPay === undefined) throw new BadRequestException('Укажите ставку за занятие');
      if (nextRole !== Role.TRAINER && Object.values(trainerFields).some(value => value !== undefined)) throw new BadRequestException('Специализация доступна только для тренера');
      const fullName = dto.fullName ?? previous!.fullName;
      let trainerId = account.trainerId;
      if (selectedTrainerId && trainerId && selectedTrainerId !== trainerId) throw new ConflictException('У сотрудника уже есть карточка тренера');
      if (selectedTrainerId && nextRole !== Role.TRAINER) throw new BadRequestException('Карточка тренера доступна только для роли Тренер');
      if (nextRole === Role.TRAINER && !trainerId) {
        const candidates = await tx.trainer.findMany({ where: selectedTrainerId ? { id: selectedTrainerId } : { OR: [
          { name: { equals: fullName.trim(), mode: 'insensitive' } }, { fullName: { equals: fullName.trim(), mode: 'insensitive' } },
          ...(dto.phone ? [{ phone: dto.phone }] : []),
        ] }, select: { id: true, user: { select: { id: true } } } });
        if (selectedTrainerId && !candidates.length) throw new BadRequestException('Тренер не найден');
        if (candidates.length > 1) throw new ConflictException('Найдено несколько тренеров. Выберите карточку тренера');
        if (candidates[0]?.user && candidates[0].user.id !== account.id) throw new ConflictException('У тренера уже есть учётная запись');
        trainerId = candidates[0]?.id ?? (await tx.trainer.create({ data: { fullName, name: fullName, phone: dto.phone || undefined, scheduleColor: dto.scheduleColor, isActive: active, isPublic: false } })).id;
      }
      if (trainerId) await tx.trainer.update({ where: { id: trainerId }, data: { ...trainerFields, ...(!active || nextRole !== Role.TRAINER ? { isPublic: false } : {}), fullName, name: fullName, ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}), ...(dto.scheduleColor !== undefined ? { scheduleColor: dto.scheduleColor } : {}), isActive: active && nextRole === Role.TRAINER } });
      const accessChanged = createCrmAccess !== undefined && createCrmAccess !== account.crmAccess;
      await tx.user.update({ where: { id: account.id }, data: { role: nextRole, trainerId, ...(email !== undefined ? { email: email.trim().toLowerCase() } : {}), ...(passwordHash ? { passwordHash } : {}), ...(!active ? { crmAccess: false } : createCrmAccess !== undefined ? { crmAccess: createCrmAccess } : {}), ...(nextRole !== account.role || !active || accessChanged || passwordHash ? { tokenVersion: { increment: 1 } } : {}) } });
      if (!active) await this.identity.applyStaff(tx, account.id, null);
      else if (normalized) await this.identity.applyStaff(tx, account.id, normalized.vkId);
      // VK notifications resolve trainers directly; keep both identities in this transaction.
      if (trainerId && (!active || normalized || account.vkId)) await tx.trainer.update({ where: { id: trainerId }, data: { vkId: active && (normalized ? normalized.vkId : account.vkId) ? BigInt((normalized ? normalized.vkId : account.vkId)!) : null } });
      if (trainerId && (payScheme !== undefined || commissionPercent !== undefined || fixedPay !== undefined)) await tx.cashAuditLog.create({ data: {
        requestId: randomUUID(), action: 'STAFF_TRAINER_RATE_UPDATED', actorId: user.id, actorName: user.email,
        details: { trainerId, payScheme, commissionPercent, fixedPay },
      } });
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
      await this.shiftUnlocked(tx, targetId, date, user);
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
  private async shiftUnlocked(tx: Prisma.TransactionClient, staffId: string, date: Date, user: AuthUser, force = false) {
    if (force && user.role !== Role.ADMIN) throw new ForbiddenException('Принудительная корректировка доступна только администратору');
    const paid = await tx.payrollCalculation.findMany({ where: { staffId, isPaid: true, periodStart: { lte: date }, periodEnd: { gte: date } } });
    if (paid.length && !force) throw new ConflictException('Дата смены входит в оплаченный период. Администратор может отменить оплату в списке ведомостей');
    // Explicit admin confirmation reopens the affected payrolls and reverses their expenses.
    // All changes, including the shift itself, commit or roll back together.
    for (const row of paid) await this.reopenPayrollInTransaction(tx, row.id, user);
  }
  payrolls(query: ShiftQueryDto, user: AuthUser) {
    return this.prisma.$transaction(async tx => {
      const staffId = await this.scope(tx, user, query.staffId);
      const where = { staffId };
      return { data: await tx.payrollCalculation.findMany({ where, include: { staff: { select: { fullName: true, roleTitle: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20), take: query.pageSize ?? 20 }), total: await tx.payrollCalculation.count({ where }) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  paidPeriods(staffId: string, user: AuthUser) {
    return this.prisma.$transaction(async tx => {
      await this.scope(tx, user, staffId);
      const select = { id: true, staffId: true, periodStart: true, periodEnd: true, createdAt: true };
      const [legacy, trainers] = await Promise.all([
        tx.payrollCalculation.findMany({ where: { staffId, isPaid: true }, select, orderBy: { periodStart: 'asc' } }),
        tx.trainerPayout.findMany({ where: { OR: [{ staffId }, { trainer: { user: { staffProfile: { id: staffId } } } }], status: 'PAID' }, select, orderBy: { periodStart: 'asc' } }),
      ]);
      return [...legacy, ...trainers.map(row => ({ ...row, staffId }))].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
    });
  }
  reopenPayroll(id: string, user: AuthUser) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Отмена оплаты доступна только администратору');
    return this.atomic(tx => this.reopenPayrollInTransaction(tx, id, user));
  }
  private async reopenPayrollInTransaction(tx: Prisma.TransactionClient, id: string, user: AuthUser) {
    const row = await tx.payrollCalculation.findUnique({ where: { id }, include: { expense: true } });
    if (!row) throw new NotFoundException('Ведомость не найдена');
    if (!row.isPaid) return row;
    if (row.expense?.archivedAt) throw new ConflictException('Архивную выплату нельзя отменить');
    if (row.expense) await tx.expense.update({ where: { id: row.expense.id }, data: { cancelledAt: row.expense.cancelledAt ?? new Date(), cancelledById: row.expense.cancelledById ?? user.id } });
    await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'PAYROLL_REOPENED', actorId: user.id, actorName: user.email, details: { calculationId: id, staffId: row.staffId, expenseId: row.expenseId, totalAmount: String(row.totalAmount), periodStart: row.periodStart.toISOString(), periodEnd: row.periodEnd.toISOString() } } });
    return tx.payrollCalculation.update({ where: { id }, data: { isPaid: false, paidAt: null, expenseId: null } });
  }
  createShifts(dto: CreateShiftDto, user: AuthUser) {
    this.manage(user);
    if (dto.days) return this.savePlannedDays(dto, user);
    if (!!dto.date === !!dto.dates) throw new BadRequestException('Укажите одну дату или список дат');
    if (dto.startTime >= dto.endTime) throw new BadRequestException('Окончание смены должно быть позже начала в тот же день');
    const dates = (dto.dates ?? [dto.date!]).map(payrollDay);
    return this.atomic(async tx => {
      const staff = await tx.staffProfile.findUnique({ where: { id: dto.staffId } });
      if (!staff?.isActive) throw new BadRequestException('Выберите активного сотрудника');
      for (const date of dates) await this.shiftUnlocked(tx, dto.staffId, date, user, dto.force);
      await tx.workShift.createMany({ data: dates.map(date => ({ staffId: dto.staffId, date, startTime: dto.startTime, endTime: dto.endTime, notes: dto.notes, createdById: user.id })) });
      return { count: dates.length };
    });
  }
  private savePlannedDays(dto: CreateShiftDto, user: AuthUser) {
    const days = dto.days!;
    if (dto.date || dto.dates || new Set(days.map(day => day.date)).size !== days.length) throw new BadRequestException('Укажите уникальные даты плана');
    if (days.some(day => day.startTime >= day.endTime)) throw new BadRequestException('Окончание смены должно быть позже начала');
    return this.atomic(async tx => {
      const staff = await tx.staffProfile.findUnique({ where: { id: dto.staffId } });
      if (!staff?.isActive) throw new BadRequestException('Выберите активного сотрудника');
      for (const day of days) {
        const date = payrollDay(day.date);
        await this.shiftUnlocked(tx, dto.staffId, date, user);
        if (await tx.trainerPayout.findFirst({ where: { OR: [{ staffId: dto.staffId }, { trainer: { user: { staffProfile: { id: dto.staffId } } } }], status: 'PAID', periodStart: { lte: date }, periodEnd: { gte: date } } })) throw new ConflictException('Дата входит в оплаченную ведомость тренера');
        const existing = await tx.workShift.findUnique({ where: { staffId_date: { staffId: dto.staffId, date } } });
        const comment = existing?.notes?.replace(/^\[plan:(OFF|VACATION)\]\n?/, '') || null;
        const planned = existing?.notes?.startsWith('[plan:OFF]') || existing?.notes?.startsWith('[plan:VACATION]');
        if (existing && (existing.startedAt || existing.endedAt || existing.status === 'COMPLETED' || existing.status === 'SICK' || existing.status === 'ABSENT' && !planned)) throw new ConflictException('План затрагивает начатую, отработанную смену или отсутствие. Измените её отдельно');
        // Existing ABSENT status excludes non-working days from payroll. Notes distinguish planned leave from an unplanned absence without a schema migration.
        const data = { startTime: day.startTime, endTime: day.endTime, status: day.kind === 'WORK' ? WorkShiftStatus.SCHEDULED : WorkShiftStatus.ABSENT, notes: day.kind === 'WORK' ? comment : `[plan:${day.kind}]${comment ? `\n${comment}` : ''}` };
        await tx.workShift.upsert({ where: { staffId_date: { staffId: dto.staffId, date } }, create: { ...data, staffId: dto.staffId, date, createdById: user.id }, update: data });
      }
      return { count: days.length };
    });
  }
  changeShift(id: string, dto: UpdateShiftDto | null, user: AuthUser) {
    this.manage(user);
    if (!dto && user.role !== Role.ADMIN) throw new ForbiddenException('Удаление доступно только администратору');
    if (dto && Object.values(dto).some(value => value === null)) throw new BadRequestException('Поля смены не могут быть null');
    return this.atomic(async tx => {
      const shift = await tx.workShift.findUnique({ where: { id } });
      if (!shift) throw new NotFoundException('Смена не найдена');
      await this.shiftUnlocked(tx, shift.staffId, shift.date, user, dto?.force);
      if (!dto) return tx.workShift.delete({ where: { id } });
      if ((dto.startTime ?? shift.startTime) >= (dto.endTime ?? shift.endTime)) throw new BadRequestException('Окончание должно быть позже начала');
      if (dto.status === 'COMPLETED' && shift.date.toISOString().slice(0, 10) > DateTime.now().setZone('Europe/Moscow').toISODate()!) throw new BadRequestException('Нельзя завершить будущую смену');
      const { force: _force, ...data } = dto;
      return tx.workShift.update({ where: { id }, data });
    });
  }
  private async compute(tx: Prisma.TransactionClient, staff: StaffProfile & { user: { trainerId: string | null } }, from: string, to: string, bonuses: Prisma.Decimal.Value = 0, penalties: Prisma.Decimal.Value = 0) {
    const range = payrollRange(from, to);
    const count = await tx.workShift.count({ where: { staffId: staff.id, status: 'COMPLETED', date: { gte: range.periodStart, lte: range.periodEnd } } });
    // Completing a Lesson does not change participant Booking.status in the schedule module.
    const lessons = staff.user.trainerId ? await tx.lesson.findMany({ where: { trainerId: staff.user.trainerId, status: 'COMPLETED', startTime: { gte: range.start, lt: range.end }, bookings: { some: { status: { in: ['scheduled', 'completed'] } } } }, select: { trainer: { select: { commissionPercent: true, payScheme: true, fixedPay: true } }, id: true, startTime: true, service: { select: { name: true, price: true } }, bookings: { where: { status: { in: ['scheduled', 'completed'] } }, select: { costAmount: true } } } }) : [];
    return { amounts: payrollAmounts(count, staff, lessons, bonuses, penalties), lessonBreakdown: lessons.map(lesson => ({ id: lesson.id, startTime: lesson.startTime!.toISOString(), serviceName: lesson.service?.name, nominalPrice: Number(lesson.service?.price ?? 0), commissionPercent: Number(lesson.trainer?.payScheme === 'CLUB' ? 30 : lesson.trainer?.commissionPercent ?? 30), payScheme: lesson.trainer?.payScheme, clientPaid: lesson.bookings.reduce((sum, booking) => sum.plus(booking.costAmount), zero()).toFixed(2), trainerPayout: trainerPayout(lesson) })) };
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
        const computed = saved?.isPaid ? undefined : await this.compute(tx, profile, query.from!, query.to!, saved?.bonuses, saved?.penalties);
        data.push({ ...saved, ...computed?.amounts, lessonBreakdown: computed?.lessonBreakdown ?? saved?.lessonBreakdown, commissionPercent: profile.user.trainer?.commissionPercent, staffId: profile.id, fullName: profile.fullName, roleTitle: profile.roleTitle, isPaid: saved?.isPaid ?? false, blocked: !!overlap && !saved?.isPaid });
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
      const { amounts, lessonBreakdown } = await this.compute(tx, staff, dto.from, dto.to, dto.bonuses, dto.penalties);
      if (amounts.totalAmount.isNegative() || [amounts.totalAmount, amounts.shiftsTotal, amounts.lessonsTotal].some(value => value.gt('9999999999.99'))) throw new BadRequestException('Суммы расчета должны быть от 0 до 9 999 999 999,99 ₽');
      return tx.payrollCalculation.upsert({ where: { staffId_periodStart_periodEnd: { staffId: staff.id, periodStart, periodEnd } }, create: { staffId: staff.id, periodStart, periodEnd, ...amounts, lessonBreakdown, createdById: user.id }, update: { ...amounts, lessonBreakdown } });
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
      const { amounts, lessonBreakdown } = await this.compute(tx, row.staff, from, to, row.bonuses, row.penalties);
      if (!amounts.totalAmount.equals(dto.expectedTotal) || !row.totalAmount.equals(dto.expectedTotal)) throw new ConflictException('Начисления изменились. Обновите и сохраните расчет перед выплатой');
      if (amounts.totalAmount.lte(0)) throw new BadRequestException('Сумма выплаты должна быть положительной');
      const paidAt = new Date();
      const shift = await tx.cashShift.findFirst({ where: { cashierId: user.id, closedAt: null, openedAt: { lte: paidAt } } });
      const expense = await tx.expense.create({ data: { category: 'SALARY', amount: amounts.totalAmount, paymentMethod: dto.paymentMethod, description: `Выплата зарплаты: ${row.staff.fullName}, период ${from}–${to}`, createdById: user.id, date: paidAt, shiftId: shift?.id } });
      // FinanceService derives balances from Expense in the same database; no duplicate balance cache.
      return tx.payrollCalculation.update({ where: { id: row.id }, data: { ...amounts, lessonBreakdown, isPaid: true, paidAt, expenseId: expense.id } });
    });
  }
}
