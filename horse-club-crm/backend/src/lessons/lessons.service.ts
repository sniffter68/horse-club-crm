import { scheduleForDay } from '../settings/club-schedule';
import { assertTrainerUnlocked } from './trainer-lock';
import { telegramCancellation } from '../modules/telegram-bot/telegram-cancellation';
import { DateTime } from 'luxon';
import type { TrainerTmaRescheduleDto, TrainerTmaRescheduleQuery } from '../modules/telegram-bot/trainer-tma.dto';
import type { TrainerStatusDto } from '../workspace/workspace.dto';
import { refundService, serviceRefundQuote } from '../payments/service-refund';
import type { CancelServiceDto } from '../payments/dto/cancel-service.dto';
import { canUseMembership, membershipAccessWhere } from '../memberships/membership-access';
import type { AuthUser } from '../auth/auth.types';
import type { CompleteLessonDto } from './dto/lesson-payment.dto';
import { money, paymentStatus, postLessonReceipt } from './lesson-finance';
import { isSerializationFailure } from '../common/serialization-failure';
import { BookingRulesService } from '../bookings/booking-rules.service';
import { randomUUID } from 'node:crypto';
import { queueVkNotification } from '../vk-bot/vk-delivery.module';
import { queueTrainingConfirmation } from '../vk-bot/vk-training-notifications';
import { queueTelegram, queueTelegramAdmins } from '../modules/telegram-bot/telegram-delivery';
import { defaultModuleAccess } from '../settings/module-access.service';
import { RoleAccessService } from '../auth/role-access.service';
import { assertHorseReplacement } from '../auth/role-access';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { LessonStatus, MembershipOpType, Prisma } from '@prisma/client';
import { MembershipLedgerService } from '../memberships/membership-ledger.service';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLessonDto } from './dto/create-lesson.dto';
import type { ListLessonsQueryDto } from './dto/list-lessons-query.dto';
import type { LessonHistoryQueryDto } from './dto/lesson-history-query.dto';

const SERIALIZATION_RETRIES = 5;
const MILLISECONDS_PER_MINUTE = 60_000;
const CLUB_SCHEDULE_ID = 1;
const CLUB_TIME_ZONE = process.env.CLUB_TIME_ZONE ?? 'Europe/Moscow';
const ALLOWED_FINAL_STATUSES: ReadonlySet<LessonStatus> = new Set([
  LessonStatus.COMPLETED,
  LessonStatus.NO_SHOW,
  LessonStatus.CANCELLED,
]);

const lessonDetails = Prisma.validator<Prisma.LessonDefaultArgs>()({
  include: {
    trainer: true,
    service: true,
    arena: true,
    bookings: {
      include: {
        client: true,
        horse: true,
        membership: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'asc' },
    },
  },
});

export type LessonDetails = Prisma.LessonGetPayload<typeof lessonDetails>;
type TransactionClient = Prisma.TransactionClient;
type LessonReader = Pick<TransactionClient, 'lesson'> | PrismaService;
type WorkloadReader =
  | Pick<TransactionClient, 'clubSchedule' | 'horse' | 'lesson'>
  | PrismaService;

interface ClubScheduleConfig {
  weekDays?: unknown;
  openTime: string;
  closeTime: string;
  daysOfWeekOff: number[];
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

export interface HorseWorkload {
  maxDailyMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
}

export interface DailyHorseWorkload {
  horseId: string;
  horseName: string;
  currentWorkloadMinutes: number;
  maxDailyWorkloadMinutes: number;
  status: 'AVAILABLE' | 'AT_LIMIT' | 'OVERLOADED' | 'UNAVAILABLE';
}

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipLedgerService: MembershipLedgerService,
    private readonly bookingRules: BookingRulesService = new BookingRulesService(),
  ) {}

  refundQuote(id: string) { return this.prisma.$transaction(tx => serviceRefundQuote(tx, 'lessons', id)).then(({ amount, refundMethod, cancelled }) => ({ amount, refundMethod, cancelled })); }

  async validateNoConflicts(
    trainerId: string,
    horseId: string | undefined,
    start: Date,
    end: Date,
    excludeLessonId?: string,
    arenaId?: string,
  ): Promise<void> {
    this.assertValidInterval(start, end);
    await this.validateNoConflictsWithClient(
      this.prisma,
      trainerId,
      horseId ? [horseId] : [],
      start,
      end,
      excludeLessonId,
      arenaId,
    );
  }

  async validateClubWorkingHours(startTime: Date, endTime: Date): Promise<void> {
    this.assertValidInterval(startTime, endTime);
    const schedule = await this.getClubSchedule(this.prisma);
    this.assertClubWorkingHours(startTime, endTime, schedule);
  }

  async validateHorseDailyLoad(
    horseId: string,
    startTime: Date,
    durationMinutes: number,
    excludeLessonId?: string,
  ): Promise<void> {
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
      throw new BadRequestException('Продолжительность занятия должна быть положительной');
    }
    await this.getHorseWorkloadWithClient(
      this.prisma,
      horseId,
      this.getLocalDateParts(startTime),
      durationMinutes,
      excludeLessonId,
    );
  }

  async getHorseWorkload(horseId: string, date: string, excludeLessonId?: string): Promise<HorseWorkload> {
    return this.getHorseWorkloadWithClient(
      this.prisma,
      horseId,
      this.parseCalendarDate(date),
      0,
      excludeLessonId,
    );
  }

  async getDailyHorseWorkload(date: string, excludeLessonId?: string): Promise<DailyHorseWorkload[]> {
    const schedule = await this.getClubSchedule(this.prisma);
    const { open, close } = this.getWorkDayBounds(this.parseCalendarDate(date), schedule);
    const [horses, lessons] = await this.prisma.$transaction([
      this.prisma.horse.findMany({ where: { deletedAt: null }, select: { id: true, name: true, maxDailyMinutes: true, isUnavailable: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      this.prisma.lesson.findMany({
        where: { status: { not: LessonStatus.CANCELLED }, startTime: { lt: close }, endTime: { gt: open },
          ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}) },
        select: { startTime: true, endTime: true, bookings: { select: { horseId: true } } },
      }),
    ]);
    const minutes = new Map<string, number>();
    for (const lesson of lessons) {
      const duration = Math.ceil(Math.max(0, (lesson.endTime.getTime() - lesson.startTime.getTime()) / MILLISECONDS_PER_MINUTE));
      for (const horseId of new Set(lesson.bookings.map(booking => booking.horseId))) {
        if (horseId) minutes.set(horseId, (minutes.get(horseId) ?? 0) + duration);
      }
    }
    return horses.map(horse => {
      const currentWorkloadMinutes = minutes.get(horse.id) ?? 0;
      return { horseId: horse.id, horseName: horse.name, currentWorkloadMinutes, maxDailyWorkloadMinutes: horse.maxDailyMinutes,
        status: horse.isUnavailable ? 'UNAVAILABLE' : currentWorkloadMinutes > horse.maxDailyMinutes ? 'OVERLOADED'
          : currentWorkloadMinutes === horse.maxDailyMinutes ? 'AT_LIMIT' : 'AVAILABLE' };
    });
  }

  async assertLessonManagement(actor: AuthUser, trainerId: string, tx: TransactionClient = this.prisma) {
    if ('telegramUserId' in actor && typeof actor.telegramUserId === 'string') {
      const user = await tx.user.findUnique({ where: { telegramUserId: actor.telegramUserId }, include: { trainer: true, staffProfile: true } })
        ?? await tx.user.findFirst({ where: { telegramUserId: null, trainer: { telegramId: actor.telegramUserId } }, include: { trainer: true, staffProfile: true } });
      if (!user || user.id !== actor.id || user.role !== actor.role || !user.crmAccess || user.staffProfile?.isActive === false
        || user.role === 'TRAINER' && (!user.trainer?.isActive || user.trainerId !== actor.trainerId))
        throw new ForbiddenException('Доступ изменён. Откройте приложение заново');
    }
    if (actor.role === 'ADMIN') return;
    const module = await tx.clubModuleSettings.findUnique({ where: { module: 'SCHEDULE' } });
    const permission = await tx.roleModulePermission.findUnique({ where: { role_module: { role: actor.role, module: 'SCHEDULE' } } });
    if (module?.isEnabled === false || (permission?.accessLevel ?? defaultModuleAccess(actor.role, 'SCHEDULE')) !== 'FULL')
      throw new ForbiddenException('Недостаточно прав для изменения расписания');
    if (actor.role === 'TRAINER') {
      const policy = await new RoleAccessService(this.prisma).permissions(actor.role, tx);
      if (!policy.lessonCreateAny && !(policy.lessonCreateOwn && actor.trainerId === trainerId))
        throw new ForbiddenException('Можно менять только свои занятия согласно настройкам роли');
    }
  }

  async moveScheduledLesson(id: string, dto: TrainerTmaRescheduleDto, actor: AuthUser) {
    return this.runSerializable(async tx => {
      const lesson = await tx.lesson.findUnique({ where: { id }, ...lessonDetails });
      if (!lesson) throw new NotFoundException('Занятие не найдено');
      if (lesson.deletedAt || lesson.status !== 'SCHEDULED') throw new ConflictException('Переносить можно только запланированные занятия');
      await this.assertLessonManagement(actor, lesson.trainerId, tx);
      if (dto.trainerId) await this.assertLessonManagement(actor, dto.trainerId, tx);
      return this.rescheduleLesson(id, this.moveStart(dto).toISO()!, (+lesson.endTime - +lesson.startTime) / 60000,
        dto.trainerId, undefined, actor, { horseId: dto.horseId, reason: dto.reason, tx });
    });
  }

  async lessonManagementDetails(id: string, actor: AuthUser) {
    const lesson = await this.findOne(id);
    await this.assertLessonManagement(actor, lesson.trainerId);
    const [horses, trainers] = await Promise.all([
      this.prisma.horse.findMany({ where: { deletedAt: null, status: 'active', healthStatus: 'HEALTHY', isUnavailable: false }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.trainer.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const policy = await new RoleAccessService(this.prisma).permissions(actor.role);
    const canReplaceHorse = actor.role === 'ADMIN' || actor.role === 'MANAGER' || policy.horseReplaceAny || policy.horseReplaceOwn && actor.trainerId === lesson.trainerId;
    return { id, startTime: lesson.startTime, endTime: lesson.endTime, trainerId: lesson.trainerId, status: lesson.status,
      serviceName: lesson.service.title || lesson.service.name, horses: canReplaceHorse ? horses : [], canReplaceHorse, trainers: policy.lessonCreateAny ? trainers : trainers.filter(t => t.id === actor.trainerId),
      bookings: lesson.bookings.map(b => ({ id: b.id, clientName: b.client.name, phone: b.client.phone, horseId: b.horseId, horseName: b.horse?.name,
        payment: b.membershipId ? 'Абонемент' : b.isPaid ? 'Оплачено' : 'Не оплачено' })) };
  }

  private moveStart(dto: { date: string; startTime: string }) {
    const start = DateTime.fromISO(`${dto.date}T${dto.startTime}`, { zone: 'Europe/Moscow' });
    if (!start.isValid || start.toISODate() !== dto.date || start.toFormat('HH:mm') !== dto.startTime)
      throw new BadRequestException('Укажите существующую дату и время');
    if (start.toMillis() <= Date.now()) throw new ConflictException('Выберите время в будущем');
    return start;
  }

  async rescheduleSlots(id: string, query: TrainerTmaRescheduleQuery, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      const lesson = await tx.lesson.findUnique({ where: { id }, ...lessonDetails });
      if (!lesson) throw new NotFoundException('Занятие не найдено');
      if (lesson.deletedAt || lesson.status !== 'SCHEDULED') throw new ConflictException('Переносить можно только запланированные занятия');
      await this.assertLessonManagement(actor, lesson.trainerId, tx);
      if (query.trainerId) await this.assertLessonManagement(actor, query.trainerId, tx);
      if (query.horseId) assertHorseReplacement(actor, lesson.trainerId, await new RoleAccessService(this.prisma).permissions(actor.role, tx));
      return this.lessonMoveSlots(tx, lesson, query);
    }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
  }

  readMoveLesson(tx: TransactionClient, id: string) { return tx.lesson.findUniqueOrThrow({ where: { id }, ...lessonDetails }); }

  async lessonMoveSlots(tx: TransactionClient, lesson: LessonDetails, query: TrainerTmaRescheduleQuery) {
    const day = DateTime.fromISO(query.date, { zone: 'Europe/Moscow' });
    if (!day.isValid || day.toISODate() !== query.date) throw new BadRequestException('Некорректная дата');
    const schedule = await this.getClubSchedule(tx);
    const slots: { startTime: string; available: boolean; reason?: string }[] = [];
    if (scheduleForDay(schedule, day.weekday).daysOfWeekOff.length) return { slots };
    const duration = (+lesson.endTime - +lesson.startTime) / 60000;
    const { open, close } = this.getWorkDayBounds(this.parseCalendarDate(query.date), schedule);
    for (let time = +open; time + duration * 60000 <= +close; time += 30 * 60000) {
      if (time <= Date.now()) continue;
      const start = new Date(time), end = new Date(time + duration * 60000);
      try {
        await this.validateLessonMove(tx, lesson, start, end, query.trainerId, undefined, query.horseId, false);
        slots.push({ startTime: DateTime.fromJSDate(start, { zone: 'Europe/Moscow' }).toFormat('HH:mm'), available: true });
      } catch (error: unknown) {
        if (!(error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException)) throw error;
        slots.push({ startTime: DateTime.fromJSDate(start, { zone: 'Europe/Moscow' }).toFormat('HH:mm'), available: false, reason: error.message });
      }
    }
    return { slots };
  }

  private async validateLessonMove(tx: TransactionClient, lesson: LessonDetails, start: Date, end: Date,
    trainerId?: string, arenaId?: string, horseId?: string, lockResources = true) {
    if (lesson.status !== 'SCHEDULED' || lesson.deletedAt) throw new ConflictException('Переносить можно только запланированные занятия');
    if (horseId && lesson.bookings.length !== 1) throw new BadRequestException('В группе заменяйте лошадь отдельно для каждого участника');
    this.assertClubWorkingHours(start, end, await this.getClubSchedule(tx));
    for (const booking of lesson.bookings.filter(row => row.status === 'scheduled')) {
      if (booking.membership && (booking.membership.deletedAt || booking.membership.cancelledAt || !booking.isPaid && booking.membership.remainedLessons <= 0 || booking.membership.validFrom > start || booking.membership.validUntil < end))
        throw new ConflictException('Абонемент участника недоступен на новое время занятия');
    }
    const participants = lesson.bookings.filter(b => b.status === 'scheduled').map(b => ({ clientId: b.clientId, horseId: horseId ?? b.horseId }));
    await this.bookingRules.validate(tx, { trainerId: trainerId ?? lesson.trainerId, arenaId: arenaId ?? lesson.arenaId,
      participants, start, end, excludeLessonId: lesson.id, lockResources }).catch((error: unknown) => {
        if (error instanceof BadRequestException) throw new ConflictException(error.message);
        throw error;
      });
    await this.validateNoConflictsWithClient(tx, trainerId ?? lesson.trainerId, participants.flatMap(b => b.horseId ? [b.horseId] : []), start, end, lesson.id, arenaId ?? lesson.arenaId ?? undefined);
    for (const horse of new Set(participants.flatMap(b => b.horseId ? [b.horseId] : [])))
      await this.getHorseWorkloadWithClient(tx, horse, this.getLocalDateParts(start), (+end - +start) / 60000, lesson.id);
  }

  async rescheduleLesson(lessonId: string, startTime: string, durationMinutes: number, trainerId?: string, arenaId?: string, actor?: AuthUser,
    options?: { horseId?: string; reason?: string; tx?: TransactionClient }): Promise<LessonDetails> {
    const eventId = randomUUID();
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) throw new BadRequestException('Укажите положительную длительность занятия');
    const start = this.parseDate(startTime, 'Некорректное время начала занятия');
    const end = new Date(start.getTime() + durationMinutes * MILLISECONDS_PER_MINUTE);
    this.assertValidInterval(start, end);
    const move = async (tx: TransactionClient) => {
      const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, ...lessonDetails });
      if (!lesson) throw new NotFoundException('Занятие не найдено');
      if (actor) {
        await this.assertLessonManagement(actor, lesson.trainerId, tx);
        if (trainerId) await this.assertLessonManagement(actor, trainerId, tx);
      }
      if (trainerId && trainerId !== lesson.trainerId) {
        // A membership selected at booking time has cost=0 / PAID before any
        // visit is debited. It must remain editable until actual settlement.
        await assertTrainerUnlocked(tx, lesson.bookings.map(booking => booking.id), lesson.status !== 'SCHEDULED'
          || lesson.paymentStatus === 'PAID_BY_MEMBERSHIP'
          || lesson.paymentStatus === 'PARTIALLY_PAID'
          || lesson.paymentStatus === 'PAID' && Number(lesson.cost) > 0);
      }
      if (lesson.status !== LessonStatus.SCHEDULED) throw new ConflictException('Переносить можно только запланированные занятия');
      if (!arenaId && lesson.arena?.isUnavailable) throw new ConflictException('Манеж недоступен на новое время занятия');
      await this.validateLessonMove(tx, lesson, start, end, trainerId, arenaId, options?.horseId);
      if (options?.horseId && options.horseId !== lesson.bookings[0]?.horseId && actor) {
        const policy = await new RoleAccessService(this.prisma).permissions(actor.role, tx);
        assertHorseReplacement(actor, lesson.trainerId, policy);
        await tx.bookingHorseChange.create({ data: { bookingId: lesson.bookings[0].id, actorUserId: actor.id,
          oldHorseId: lesson.bookings[0].horseId, newHorseId: options.horseId, reason: options.reason || 'Замена при переносе занятия' } });
      }
      await tx.booking.updateMany({ where: { lessonId }, data: { startTime: start, endTime: end,
        trainerId: trainerId ?? lesson.trainerId, arenaId: arenaId ?? lesson.arenaId,
        ...(options?.horseId ? { horseId: options.horseId } : {}),
        ...(+lesson.startTime !== +start ? { clientConfirmed: false, clientCancellationRequested: false } : {}) } });
      const updated = await tx.lesson.update({ where: { id: lessonId }, data: { startTime: start, endTime: end, ...(trainerId ? { trainerId } : {}), ...(arenaId ? { arenaId } : {}) }, ...lessonDetails });
      if (trainerId && trainerId !== lesson.trainerId || arenaId && arenaId !== lesson.arenaId || lesson.startTime.getTime() !== start.getTime() || lesson.endTime.getTime() !== end.getTime()) {
        await this.notifyLesson(tx, updated, `rescheduled:${eventId}`, 'Тренировка перенесена', undefined, lesson.startTime);
        const format = (date: Date) => DateTime.fromJSDate(date, { zone: 'Europe/Moscow' }).toFormat('dd.MM.yyyy HH:mm');
        await queueTelegramAdmins(tx, `admin:reschedule:${eventId}`, `Тренировка перенесена: ${format(lesson.startTime)} → ${format(start)} (Москва)\n${options?.reason ?? ''}`);
        if (actor) await tx.cashAuditLog.create({ data: { requestId: eventId, action: 'LESSON_RESCHEDULED', actorId: actor.id, actorName: actor.email,
          details: { lessonId, startTime, previousStart: lesson.startTime.toISOString(), previousTrainerId: lesson.trainerId,
            trainerId: updated.trainerId, horseId: options?.horseId ?? null, reason: options?.reason ?? null } } });
      }
      return updated;
    };
    return options?.tx ? move(options.tx) : this.runSerializable(move);
  }

  async createLesson(dto: CreateLessonDto, transaction?: Prisma.TransactionClient, actor?: AuthUser): Promise<LessonDetails> {
    if (actor?.role === 'TRAINER') {
      const policy = await new RoleAccessService(this.prisma).permissions('TRAINER', transaction ?? this.prisma);
      if (!policy.lessonCreateOwn && !policy.lessonCreateAny) throw new ForbiddenException('Создание записей в расписании запрещено настройками роли');
      if (!policy.lessonCreateAny) {
        if (!actor.trainerId) throw new ForbiddenException('Профиль пользователя не привязан к тренеру');
        if (dto.trainerId && dto.trainerId !== actor.trainerId) throw new ForbiddenException('Тренер может создавать записи только в своё расписание');
      }
      if ([dto.cost, dto.pricePerPerson, dto.prepaymentAmount, dto.prepaymentMethod].some(value => value !== undefined)) {
        throw new ForbiddenException('Тренер не может указывать финансовые параметры оплаты при записи');
      }
      dto = { ...dto, trainerId: dto.trainerId || actor.trainerId || '' };
    }
    if (!dto.trainerId) throw new BadRequestException('Укажите тренера');
    if (dto.participants && (dto.clientId || dto.horseId || dto.membershipId)) {
      throw new BadRequestException('Передайте участников либо в participants, либо в устаревших полях clientId/horseId/membershipId');
    }
    if (dto.membershipId && !dto.clientId) {
      throw new BadRequestException('membershipId можно передать только вместе с clientId');
    }
    if (dto.horseId && !dto.clientId) {
      throw new BadRequestException('horseId можно передать только вместе с clientId');
    }
    const participants = dto.participants ?? (dto.clientId ? [{
      clientId: dto.clientId,
      ...(dto.horseId ? { horseId: dto.horseId } : {}),
      ...(dto.membershipId ? { membershipId: dto.membershipId } : {}),
    }] : []);
    const explicitPrice = dto.cost != null || dto.prepaymentAmount != null || dto.prepaymentMethod != null;
    if (explicitPrice && (participants.length !== 1 || participants[0].membershipId)) {
      throw new BadRequestException('Стоимость и предоплату укажите для одного участника без абонемента');
    }
    const clientIds = participants.map(participant => participant.clientId);
    if (new Set(clientIds).size !== clientIds.length) {
      throw new BadRequestException('Один клиент не может быть добавлен в занятие дважды');
    }
    const horseIds = participants
      .map(participant => participant.horseId)
      .filter((horseId): horseId is string => Boolean(horseId));
    if (new Set(horseIds).size !== horseIds.length) {
      throw new BadRequestException('Одна лошадь не может быть назначена нескольким участникам занятия');
    }
    const start = this.parseDate(dto.startTime, 'Некорректное время начала занятия');

    const create = async (tx: Prisma.TransactionClient): Promise<LessonDetails> => {
      const service = await tx.service.findUnique({
        where: { id: dto.serviceId },
        select: { durationMinutes: true, price: true, title: true, name: true, maxCapacity: true, allowMembership: true, isPerPerson: true },
      });
      if (!service) {
        throw new NotFoundException('Услуга не найдена');
      }
      if (!Number.isSafeInteger(service.maxCapacity) || service.maxCapacity < 1) {
        throw new InternalServerErrorException('Для услуги указана некорректная вместимость');
      }
      if (participants.length > service.maxCapacity) {
        throw new BadRequestException(`Для услуги разрешено не более ${service.maxCapacity} участников`);
      }
      const perPerson = service.isPerPerson || /экскурс|excursion/i.test(`${service.title} ${service.name}`) || dto.pricePerPerson != null || (dto.participantsCount ?? 1) > 1;
      const participantsCount = perPerson ? dto.participantsCount ?? 1 : 1;
      if (!Number.isInteger(participantsCount) || participantsCount < 1 || participantsCount > 100) throw new BadRequestException('Количество участников должно быть от 1 до 100');
      if (perPerson && (participants.length !== 1 || participants[0].membershipId)) throw new BadRequestException('Для группового мероприятия укажите одного организатора без абонемента');
      const pricePerPerson = perPerson ? money(dto.pricePerPerson ?? service.price ?? 0) : null;
      const unitCost = money(dto.cost ?? pricePerPerson?.mul(participantsCount) ?? service.price ?? 0);
      const prepayment = money(dto.prepaymentAmount ?? 0);
      if (prepayment.gt(unitCost)) throw new BadRequestException('Предоплата не может превышать стоимость');
      if (prepayment.gt(0) && !dto.prepaymentMethod) throw new BadRequestException('Выберите способ предоплаты');
      const totalCost = money(unitCost.mul(participants.filter(p => !p.membershipId).length));
      if (dto.arenaId) {
        const arena = await tx.arena.findUnique({
          where: { id: dto.arenaId },
          select: { name: true, isUnavailable: true, capacity: true },
        });
        if (!arena) throw new NotFoundException('Манеж не найден');
        if (arena.isUnavailable) throw new ConflictException(`Манеж "${arena.name}" недоступен`);
        if ((perPerson ? participantsCount : participants.length) > arena.capacity) {
          throw new BadRequestException(`Вместимость манежа "${arena.name}" — ${arena.capacity} участников`);
        }
      }

      const durationMinutes = dto.durationMinutes ?? service.durationMinutes;
      if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
        throw new InternalServerErrorException(
          'Для услуги указана некорректная продолжительность',
        );
      }

      const end = new Date(
        start.getTime() + durationMinutes * MILLISECONDS_PER_MINUTE,
      );
      this.assertValidInterval(start, end);
      for (const participant of participants) {
        if (!participant.membershipId) continue;
        if (!service.allowMembership) throw new BadRequestException('Услуга не допускает оплату абонементом');
        const membership = await tx.membership.findUnique({ where: { id: participant.membershipId },
          select: { id: true, clientId: true, remainedLessons: true, validFrom: true, validUntil: true, deletedAt: true, status: true, serviceId: true, type: true } });
        if (!membership || !await canUseMembership(tx, membership, participant.clientId)) {
          throw new BadRequestException('Абонемент не принадлежит участнику');
        }
        if (membership.serviceId && membership.serviceId !== dto.serviceId || membership.type && membership.type !== 'fixed_lessons') throw new BadRequestException('Абонемент не подходит для выбранной услуги');
        if (membership.deletedAt || membership.status !== 'active' || membership.remainedLessons <= 0 || membership.validFrom > start || membership.validUntil < end) {
          throw new BadRequestException('Абонемент недоступен на время занятия');
        }
      }
      const schedule = await this.getClubSchedule(tx);
      this.assertClubWorkingHours(start, end, schedule);
      // Each create request owns its lesson, participants, status and payments.
      // Group participants are supplied explicitly; never append to another lesson.
      await this.bookingRules.validate(tx, { trainerId: dto.trainerId, arenaId: dto.arenaId, participants, start, end });
      await this.validateNoConflictsWithClient(
        tx,
        dto.trainerId,
        horseIds,
        start,
        end,
        undefined,
        dto.arenaId,
      );
      for (const horseId of horseIds) {
        await this.getHorseWorkloadWithClient(
          tx,
          horseId,
          this.getLocalDateParts(start),
          durationMinutes,
        );
      }

      const bookingCreateData = participants.map(participant => ({
        trainerId: dto.trainerId,
        arenaId: dto.arenaId ?? null,
        startTime: start,
        endTime: end,
        costAmount: participant.membershipId || (!perPerson && dto.cost == null) ? service.price : unitCost,
        legacyLessonBinding: true,
        ...(prepayment.gt(0) ? { prepaymentAmount: prepayment, prepaymentMethod: dto.prepaymentMethod } : {}),
        clientId: participant.clientId,
        ...(participant.horseId ? { horseId: participant.horseId } : {}),
        ...(participant.membershipId ? { membershipId: participant.membershipId } : {}),
        ...(!participant.membershipId && unitCost.minus(prepayment).gt(0)
          ? { payments: { create: {
              clientId: participant.clientId,
              amount: !perPerson && dto.cost == null && prepayment.isZero() ? service.price : unitCost.minus(prepayment),
              method: 'UNSPECIFIED' as const,
              status: 'PENDING' as const,
              description: `Начисление за занятие: ${service.title || service.name}`,
            } } }
          : {}),
      }));

      const created = await tx.lesson.create({
        data: {
          trainerId: dto.trainerId,
          serviceId: dto.serviceId,
          ...(dto.arenaId ? { arenaId: dto.arenaId } : {}),
          startTime: start,
          endTime: end,
          status: LessonStatus.SCHEDULED,
          participantsCount,
          pricePerPerson,
          cost: totalCost, prepaymentAmount: prepayment, prepaymentMethod: prepayment.gt(0) ? dto.prepaymentMethod : undefined,
          paymentStatus: actor?.role === 'TRAINER' && !participants.some(row => row.membershipId) ? 'UNPAID' : paymentStatus(totalCost, prepayment),
          ...(participants.length
            ? {
                bookings: {
                  create: bookingCreateData,
                },
              }
            : {}),
        },
        ...lessonDetails,
      });
      await this.recordPrepayment(tx, created, clientIds[0], prepayment, dto.prepaymentMethod, actor);
      await this.notifyLesson(tx, created, 'created', 'Запись на тренировку подтверждена');
      if (actor) await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: actor.role === 'TRAINER' ? 'LESSON_CREATED_BY_TRAINER' : 'LESSON_CREATED', actorId: actor.id, actorName: actor.email, details: { lessonId: created.id, trainerId: created.trainerId } } });
      return created;
    };
    return transaction ? create(transaction) : this.runSerializable(create);
  }

  async findAll(query: ListLessonsQueryDto): Promise<LessonDetails[]> {
    const from = this.parseDate(query.from, 'Некорректный параметр from');
    const to = this.parseDate(query.to, 'Некорректный параметр to');
    if (to.getTime() - from.getTime() > 93 * 86_400_000) throw new BadRequestException('Выберите период не более 93 дней');
    if (from >= to) {
      throw new BadRequestException('Параметр from должен быть раньше параметра to');
    }

    return this.prisma.lesson.findMany({
      where: { deletedAt: null,
        ...(query.trainerId ? { trainerId: query.trainerId } : {}),
        ...(query.horseId ? { bookings: { some: { horseId: query.horseId } } } : {}),
        ...(query.arenaId ? { arenaId: query.arenaId } : {}),
        ...(query.status ? { status: query.status } : {}),
        // Возвращаем занятия, пересекающие полуоткрытый интервал [from, to).
        endTime: { gt: from },
        startTime: { lt: to },
      },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      ...lessonDetails,
    });
  }

  async findHistory(query: LessonHistoryQueryDto): Promise<PaginatedResult<LessonDetails>> {
    const options = parseRefineQuery(query, ['startTime', 'endTime', 'status', 'createdAt', 'updatedAt'], 'startTime');
    const from = query.from ? this.parseDate(query.from, 'Некорректный параметр from') : undefined;
    const to = query.to ? this.parseDate(query.to, 'Некорректный параметр to') : undefined;
    if (from && to && from > to) throw new BadRequestException('Параметр from должен быть раньше параметра to');

    const where: Prisma.LessonWhereInput = {
      ...(from || to ? { startTime: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.trainerId ? { trainerId: query.trainerId } : {}),
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.arenaId ? { arenaId: query.arenaId } : {}),
      ...(query.clientId ? { bookings: { some: { clientId: query.clientId } } } : {}),
      ...(query.horseId ? { bookings: { some: { horseId: query.horseId } } } : {}),
      ...(options.search ? {
        OR: [
          { service: { is: { title: { contains: options.search, mode: 'insensitive' } } } },
          { service: { is: { name: { contains: options.search, mode: 'insensitive' } } } },
          { trainer: { is: { name: { contains: options.search, mode: 'insensitive' } } } },
          { arena: { is: { name: { contains: options.search, mode: 'insensitive' } } } },
          { bookings: { some: { client: { is: { OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { firstName: { contains: options.search, mode: 'insensitive' } },
            { lastName: { contains: options.search, mode: 'insensitive' } },
            { phone: { contains: options.search, mode: 'insensitive' } },
          ] } } } } },
          { bookings: { some: { horse: { is: { name: { contains: options.search, mode: 'insensitive' } } } } } },
        ],
      } : {}),
    };
    const orderBy = { [options.sort]: options.order } as Prisma.LessonOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.lesson.count({ where }),
      this.prisma.lesson.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
        ...lessonDetails,
      }),
    ]);
    return { total, data };
  }

  async findOne(lessonId: string): Promise<LessonDetails> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      ...lessonDetails,
    });
    if (!lesson) {
      throw new NotFoundException('Занятие не найдено');
    }
    return lesson;
  }

  changeTrainer(id: string, trainerId: string, actor: AuthUser) {
    return this.runSerializable(async tx => {
      const lesson = await tx.lesson.findUnique({ where: { id }, ...lessonDetails });
      if (!lesson) throw new NotFoundException('Занятие не найдено');
      return this.rescheduleLesson(id, lesson.startTime.toISOString(),
        (lesson.endTime.getTime() - lesson.startTime.getTime()) / MILLISECONDS_PER_MINUTE, trainerId, undefined, actor, { tx });
    });
  }

  async deleteLesson(lessonId: string, actor: AuthUser, dto?: CancelServiceDto) {
    await this.updateLessonStatus(lessonId, LessonStatus.CANCELLED, {}, actor, dto);
    return { success: true, message: 'Занятие успешно удалено' };
  }

  async payWithMembership(lessonId: string, membershipId: string, actor: AuthUser): Promise<LessonDetails> {
    return this.runSerializable(async tx => {
      const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, ...lessonDetails });
      if (!lesson || lesson.deletedAt) throw new NotFoundException('Занятие не найдено');
      if (lesson.status === 'CANCELLED') throw new ConflictException('Занятие отменено');
      if (lesson.paymentStatus !== 'UNPAID') throw new ConflictException('Оплатить абонементом можно только неоплаченное занятие');
      if (!lesson.service.allowMembership || lesson.pricePerPerson != null) throw new BadRequestException('Услуга не допускает оплату абонементом');
      if (lesson.bookings.length !== 1) throw new BadRequestException('Для оплаты абонементом требуется занятие с одним участником');
      const booking = lesson.bookings[0];
      if (booking.membershipId || booking.isPaid || money(booking.prepaymentAmount).gt(0) || money(booking.finalPaymentAmount).gt(0)
        || booking.payments.some(p => p.status === 'PAID')) throw new ConflictException('У занятия уже есть оплата');
      const membership = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!membership || !await canUseMembership(tx, membership, booking.clientId)) throw new BadRequestException('Абонемент не принадлежит клиенту занятия');
      const now = new Date();
      const deferredPayment = lesson.startTime <= now;
      if (membership.deletedAt || membership.status !== 'active' || membership.type !== 'fixed_lessons' || membership.remainedLessons <= 0
        || membership.validFrom > now || membership.validUntil < now
        || (!deferredPayment && (membership.validFrom > lesson.startTime || membership.validUntil < lesson.endTime))) throw new BadRequestException('Абонемент недоступен для занятия');
      if (membership.serviceId && membership.serviceId !== lesson.serviceId) throw new BadRequestException('Абонемент предназначен для другой услуги');
      // The ledger owns the atomic decrement and audited DEBIT. Completion and
      // cancellation reuse that operation, so neither can consume a second visit.
      const reason = deferredPayment ? 'Отложенная оплата занятия абонементом' : 'Оплата занятия абонементом';
      await this.membershipLedgerService.debitLesson(membershipId, lessonId, reason, tx, booking.clientId);
      await tx.booking.update({ where: { id: booking.id }, data: { membershipId, isPaid: true, financialActorId: actor.id } });
      await tx.payment.updateMany({ where: { bookingId: booking.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      if (lesson.status === 'COMPLETED') {
        await tx.$queryRaw`SELECT post_late_membership_revenue(${booking.id}::uuid, ${lesson.startTime}::timestamptz, ${membershipId}::uuid, ${actor.id}::uuid)::text`;
      }
      await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'LESSON_PAID_BY_MEMBERSHIP', actorId: actor.id,
        actorName: actor.email, details: { lessonId, bookingId: booking.id, membershipId, deferredPayment, reason } } });
      return tx.lesson.update({ where: { id: lessonId }, data: { cost: 0, paymentStatus: 'PAID_BY_MEMBERSHIP', financialActorId: actor.id }, ...lessonDetails });
    });
  }

  /** Unlinking is an explicit audited settlement, never a generic Booking PATCH. */
  async unlinkMembership(lessonId: string, bookingId: string, reason: string, actor: AuthUser): Promise<LessonDetails> {
    reason = reason.trim();
    if (!reason) throw new BadRequestException('Укажите причину отвязки абонемента');
    return this.runSerializable(async tx => {
      const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, ...lessonDetails });
      if (!lesson || lesson.deletedAt || lesson.status === 'CANCELLED') throw new NotFoundException('Занятие не найдено');
      const booking = lesson.bookings.find(row => row.id === bookingId);
      if (!booking) throw new NotFoundException('Участник занятия не найден');
      if (!booking.membershipId) return lesson;
      if (booking.payments.some(row => row.status === 'PAID')) throw new ConflictException('Участник также оплачен деньгами. Сначала согласуйте способ оплаты');
      const membershipId = booking.membershipId;
      const debit = await tx.membershipOp.findFirst({ where: { membershipId, lessonId, type: 'DEBIT',
        OR: [{ attendeeClientId: booking.clientId }, ...(booking.membership?.clientId === booking.clientId ? [{ attendeeClientId: null }] : [])] } });
      const refund = await tx.membershipOp.findFirst({ where: { membershipId, lessonId, type: 'REFUND',
        OR: [{ attendeeClientId: booking.clientId }, ...(booking.membership?.clientId === booking.clientId ? [{ attendeeClientId: null }] : [])] } });
      if (debit && !refund) await this.membershipLedgerService.refundLesson(membershipId, lessonId, reason, tx, debit.attendeeClientId ?? undefined);
      if (lesson.status === 'COMPLETED') {
        // Keep recognition append-only; transfer only the outstanding membership revenue.
        const earned = await tx.revenueRecognition.aggregate({ where: { bookingId, membershipId }, _sum: { amount: true } });
        await tx.revenueRecognition.create({ data: { bookingId, membershipId, type: 'UNLINK_MEMBERSHIP_REVERSAL',
          amount: (earned._sum.amount ?? new Prisma.Decimal(0)).negated(), recognizedAt: lesson.startTime, createdById: actor.id } });
        const oneOff = await tx.revenueRecognition.aggregate({ where: { bookingId, membershipId: null }, _sum: { amount: true } });
        await tx.revenueRecognition.create({ data: { bookingId, type: 'UNLINK_ONE_OFF_RECOGNITION',
          amount: money(lesson.service.price).minus(oneOff._sum.amount ?? 0), recognizedAt: lesson.startTime, createdById: actor.id } });
      }
      await tx.booking.update({ where: { id: bookingId }, data: { membershipId: null, isPaid: money(booking.costAmount).lte(0), financialActorId: actor.id } });
      const cost = lesson.bookings.filter(row => row.id === bookingId || !row.membershipId)
        .reduce((sum, row) => sum.plus(row.costAmount), new Prisma.Decimal(0));
      const paid = lesson.bookings.filter(row => !row.membershipId)
        .reduce((sum, row) => sum.plus(row.prepaymentAmount).plus(row.finalPaymentAmount), new Prisma.Decimal(0));
      await tx.lesson.update({ where: { id: lessonId }, data: { cost, paymentStatus: paymentStatus(cost, paid), financialActorId: actor.id } });
      if (money(booking.costAmount).gt(0)) await tx.payment.create({ data: { bookingId, clientId: booking.clientId,
        amount: booking.costAmount, method: 'UNSPECIFIED', status: 'PENDING', description: 'Оплата после отвязки абонемента' } });
      await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'LESSON_MEMBERSHIP_UNLINKED', actorId: actor.id,
        actorName: actor.email, details: { lessonId, bookingId, membershipId, reason } } });
      return tx.lesson.findUniqueOrThrow({ where: { id: lessonId }, ...lessonDetails });
    });
  }

  async updateLessonStatus(
    lessonId: string,
    newStatus: LessonStatus,
    payment: CompleteLessonDto = {},
    actor?: AuthUser,
    cancellation?: Partial<CancelServiceDto>,
    telegramSender?: string,
    trainerUpdate?: TrainerStatusDto,
    scheduledCancellation = false,
  ): Promise<LessonDetails> {
    if (trainerUpdate && (trainerUpdate.status !== newStatus || !['COMPLETED', 'NO_SHOW'].includes(newStatus))) {
      throw new BadRequestException('Тренеру доступны только отметки проведения и неявки');
    }
    if (!ALLOWED_FINAL_STATUSES.has(newStatus)) {
      throw new BadRequestException('Недопустимый статус занятия');
    }

    return this.runSerializable(async (tx) => {
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        select: {
          trainerId: true, status: true, cancelledAt: true, cost: true, prepaymentAmount: true, finalPaymentAmount: true, startTime: true, serviceId: true,
          service: { select: { allowMembership: true } },
          bookings: { where: { status: { in: ['scheduled', 'completed', 'no_show'] } }, select: { id: true, clientId: true, membership: { select: { clientId: true } }, membershipId: true, costAmount: true, prepaymentAmount: true, finalPaymentAmount: true, isPaid: true, client: { select: { name: true } }, payments: { where: { status: 'PAID' }, select: { amount: true } } } },
          operations: {
            where: {
              type: { in: [MembershipOpType.DEBIT, MembershipOpType.REFUND] },
            },
            select: { membershipId: true, type: true, attendeeClientId: true },
          },
        },
      });
      if (!lesson) {
        throw new NotFoundException('Занятие не найдено');
      }
      if (scheduledCancellation) {
        if (!actor) throw new ForbiddenException('Требуется пользователь');
        await this.assertLessonManagement(actor, lesson.trainerId, tx);
        if (lesson.status !== 'SCHEDULED') throw new ConflictException('Отменять можно только запланированные занятия');
        if (!cancellation?.reason?.trim()) throw new BadRequestException('Укажите причину отмены');
        const quote = await serviceRefundQuote(tx, 'lessons', lessonId);
        if (quote.paid.gt(0)) throw new ConflictException('Для возврата оплаты откройте полную CRM');
      }
      if (trainerUpdate) {
        const user = actor && await tx.user.findUnique({ where: { id: actor.id }, include: { trainer: true } });
        if (!user || user.role !== 'TRAINER' || !user.crmAccess || !user.trainer?.isActive || user.trainerId !== lesson.trainerId)
          throw new ForbiddenException('Можно отмечать только свои занятия');
        if (lesson.status !== 'SCHEDULED' && lesson.status !== newStatus)
          throw new ConflictException('Занятие уже отмечено. Обратитесь к администратору');
      }
      if (telegramSender) {
        const user = await tx.user.findUnique({ where: { telegramUserId: telegramSender }, include: { trainer: true, staffProfile: true } })
          ?? await tx.user.findFirst({ where: { telegramUserId: null, trainer: { telegramId: telegramSender } }, include: { trainer: true, staffProfile: true } });
        if (!user || !user.crmAccess || user.id !== actor?.id || user.role !== actor.role || (user.role !== 'ADMIN' && user.trainer?.isActive === false) || user.staffProfile?.isActive === false)
          throw new ForbiddenException('Можно менять только свои занятия');
        await this.assertLessonManagement(actor, lesson.trainerId, tx);
        const module = await tx.clubModuleSettings.findUnique({ where: { module: 'SCHEDULE' } });
        const permission = await tx.roleModulePermission.findUnique({ where: { role_module: { role: user.role, module: 'SCHEDULE' } } });
        if (module?.isEnabled === false || user.role !== 'ADMIN' && (permission?.accessLevel ?? defaultModuleAccess(user.role, 'SCHEDULE')) !== 'FULL')
          throw new ForbiddenException('Недостаточно прав для изменения занятия');
      }
      if (newStatus === LessonStatus.CANCELLED) await refundService(tx, 'lessons', lessonId, cancellation, actor);
      if (lesson.status === newStatus && (newStatus !== LessonStatus.CANCELLED || lesson.cancelledAt)) {
        return tx.lesson.findUniqueOrThrow({
          where: { id: lessonId },
          ...lessonDetails,
        });
      }
      if (lesson.status === LessonStatus.CANCELLED && newStatus !== LessonStatus.CANCELLED) {
        throw new ConflictException(
          'Отменённое занятие нельзя перевести в другой статус',
        );
      }

      // Один абонемент может быть указан в нескольких bookings одного урока.
      // Дедупликация не допускает второго списания, а сортировка задаёт единый
      // порядок advisory-lock и предотвращает взаимные блокировки.
      const resolvedMembershipIds: Array<string | null> = [];
      for (const booking of lesson.bookings) {
        let membershipId = booking.membershipId;
        if (
          !membershipId && lesson.cost == null &&
          lesson.service.allowMembership &&
          (newStatus === LessonStatus.COMPLETED || newStatus === LessonStatus.NO_SHOW)
        ) {
          const membership = await tx.membership.findFirst({
            where: {
              AND: [membershipAccessWhere(booking.clientId)], status: 'active',
              deletedAt: null,
              remainedLessons: { gt: 0 },
              validUntil: { gte: new Date() },
              validFrom: { lte: new Date() },
            },
            orderBy: [{ validUntil: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
          });
          membershipId = membership?.id ?? null;
          if (membershipId) {
            await tx.booking.update({
              where: { id: booking.id },
              data: { membershipId },
            });
            const paid = await tx.payment.count({ where: { bookingId: booking.id, status: 'PAID' } });
            if (paid) throw new ConflictException('Занятие уже оплачено деньгами: сначала согласуйте способ оплаты');
            await tx.payment.updateMany({ where: { bookingId: booking.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
          }
        }
        resolvedMembershipIds.push(membershipId);
      }

      const participantsToCharge = lesson.bookings.map((booking, index) => ({
        membershipId: resolvedMembershipIds[index], clientId: booking.clientId,
      })).filter((row): row is { membershipId: string; clientId: string } => Boolean(row.membershipId))
        .sort((a, b) => a.membershipId.localeCompare(b.membershipId) || a.clientId.localeCompare(b.clientId));
      const uniqueParticipants = [...new Map(participantsToCharge.map(p => [`${p.membershipId}:${p.clientId}`, p])).values()];
      for (const participant of uniqueParticipants) {
        // Historical operations without attendee identity belong to the purchaser.
        const matching = lesson.operations.filter(op => op.membershipId === participant.membershipId
          && (op.attendeeClientId === participant.clientId || (!op.attendeeClientId
            && lesson.bookings.some(b => b.clientId === participant.clientId && b.membership?.clientId === participant.clientId))));
        const debit = matching.find(op => op.type === MembershipOpType.DEBIT);
        if (newStatus === LessonStatus.COMPLETED || newStatus === LessonStatus.NO_SHOW) {
          if (!debit) await this.membershipLedgerService.debitLesson(participant.membershipId, lessonId,
            newStatus === LessonStatus.COMPLETED ? 'Занятие завершено' : 'Неявка на занятие', tx, participant.clientId);
        }
      }

      if (newStatus === LessonStatus.CANCELLED) {
        // Include former participants: the journal, rather than current bookings,
        // determines which visits must be credited back.
        const key = (op: { membershipId: string; attendeeClientId: string | null }) => `${op.membershipId}:${op.attendeeClientId ?? ''}`;
        const refunded = new Set(lesson.operations.filter(op => op.type === MembershipOpType.REFUND).map(key));
        for (const debit of lesson.operations.filter(op => op.type === MembershipOpType.DEBIT)) {
          if (refunded.has(key(debit))) continue;
          await this.membershipLedgerService.refundLesson(debit.membershipId, lessonId, cancellation?.reason || 'Отмена занятия', tx, debit.attendeeClientId ?? undefined);
          refunded.add(key(debit));
        }
      }

      let financialData: Prisma.LessonUpdateInput = actor ? { financialActorId: actor.id } : {};
      if (newStatus !== 'COMPLETED' && (payment.payRemaining || payment.paymentMethod || payment.customAmount != null)) {
        throw new BadRequestException('Оплата доступна при завершении занятия');
      }
      if (newStatus === 'COMPLETED') {
        const oneOff = lesson.bookings.filter((_, index) => !resolvedMembershipIds[index]);
        const cost = money(lesson.cost ?? oneOff.reduce((sum, b) => sum.plus(b.costAmount ?? 0), new Prisma.Decimal(0)));
        const prepaid = money(lesson.prepaymentAmount ?? 0);
        const paidByBooking = oneOff.map(b => Prisma.Decimal.max(
          new Prisma.Decimal(b.prepaymentAmount ?? 0).plus(b.finalPaymentAmount ?? 0),
          b.isPaid ? b.costAmount ?? 0 : b.payments?.reduce((v, p) => v.plus(p.amount), new Prisma.Decimal(0)) ?? 0));
        const previouslyPaid = paidByBooking.reduce((sum, paid) => sum.plus(paid), new Prisma.Decimal(0));
        const remaining = Prisma.Decimal.max(0, cost.minus(previouslyPaid));
        const acceptPayment = payment.payRemaining ?? Boolean(payment.paymentMethod);
        if (acceptPayment && remaining.gt(0) && !payment.paymentMethod) throw new BadRequestException('Выберите способ доплаты');
        if (!acceptPayment && payment.customAmount != null) throw new BadRequestException('Укажите приём доплаты');
        const amount = acceptPayment ? money(payment.customAmount ?? remaining) : new Prisma.Decimal(0);
        if (amount.gt(remaining)) throw new BadRequestException('Доплата не может превышать остаток');
        let toCollect = amount;
        for (const [index, booking] of oneOff.entries()) {
          const bookingCost = money(booking.costAmount ?? cost);
          const allocatedPaid = Prisma.Decimal.min(bookingCost, paidByBooking[index]);
          const collected = Prisma.Decimal.min(toCollect, bookingCost.minus(allocatedPaid));
          if (collected.gt(0)) {
            const date = lesson.startTime.toLocaleString('ru-RU', { timeZone: CLUB_TIME_ZONE });
            await postLessonReceipt(tx, actor, booking, lesson.serviceId, collected, payment.paymentMethod,
              `Оплата занятия: ${booking.client?.name ?? booking.clientId}, ${date}`, 'LESSON_PAYMENT');
            toCollect = toCollect.minus(collected);
          }
          if (collected.gt(0) || allocatedPaid.gte(bookingCost)) {
            const outstanding = bookingCost.minus(allocatedPaid).minus(collected);
            await tx.booking.update({ where: { id: booking.id }, data: { isPaid: outstanding.lte(0), finalPaymentAmount: allocatedPaid.minus(booking.prepaymentAmount ?? 0).plus(collected), ...(collected.gt(0) ? { finalPaymentMethod: payment.paymentMethod } : {}) } });
            if (outstanding.lte(0)) await tx.payment.updateMany({ where: { bookingId: booking.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
            else await tx.payment.updateMany({ where: { bookingId: booking.id, status: 'PENDING' }, data: { amount: outstanding } });
          }
        }
        financialData = { ...financialData, cost, paymentStatus: oneOff.length === 0 && lesson.bookings.length > 0 ? 'PAID_BY_MEMBERSHIP' : paymentStatus(cost, previouslyPaid.plus(amount)),
          finalPaymentAmount: previouslyPaid.minus(prepaid).plus(amount),
          ...(amount.gt(0) ? { finalPaymentMethod: payment.paymentMethod } : {}) };
      }
      const updated = await tx.lesson.update({
        where: { id: lessonId },
        data: { status: newStatus, ...financialData, ...(trainerUpdate?.trainerNote !== undefined ? { trainerNote: trainerUpdate.trainerNote.trim() } : {}),
          ...(newStatus === 'NO_SHOW' && cancellation?.reason ? { bookings: { updateMany: { where: {}, data: { cancellationReason: cancellation.reason } } } } : {}),
          ...(newStatus === 'CANCELLED' ? { cancelledAt: new Date(), deletedAt: new Date(), bookings: { updateMany: { where: {}, data: { status: 'cancelled_club', cancellationReason: cancellation?.reason ?? 'Отмена занятия' } } } } : {}) },
        ...lessonDetails,
      });
      if (newStatus === LessonStatus.CANCELLED) await this.notifyLesson(tx, updated, 'cancelled', 'Тренировка отменена');
      if (newStatus === LessonStatus.COMPLETED) await this.notifyTelegramLesson(tx, updated, 'completed', 'Тренировка состоялась');
      if (actor && newStatus !== 'CANCELLED') await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: `LESSON_${newStatus}`, actorId: actor.id, actorName: actor.email, details: { lessonId, status: newStatus } } });
      return updated;
    });
  }

  private async recordPrepayment(tx: TransactionClient, lesson: LessonDetails, clientId: string,
    amount: Prisma.Decimal, method: CreateLessonDto['prepaymentMethod'], actor?: AuthUser) {
    if (!amount.gt(0)) return;
    const booking = lesson.bookings.find(b => b.clientId === clientId);
    if (!booking) throw new BadRequestException('Участник для предоплаты не найден');
    const date = lesson.startTime.toLocaleString('ru-RU', { timeZone: CLUB_TIME_ZONE });
    await postLessonReceipt(tx, actor, booking, lesson.serviceId, amount, method,
      `Предоплата за занятие ${date} (${booking.client.name})`, 'LESSON_PREPAYMENT');
    await tx.booking.update({ where: { id: booking.id }, data: { isPaid: amount.gte(booking.costAmount) } });
  }

  private async notifyLesson(tx: TransactionClient, lesson: LessonDetails, event: string, title: string,
    clientIds?: string[], previousStart?: Date): Promise<void> {
    await this.notifyTelegramLesson(tx, lesson, event, title, clientIds, previousStart);
    const participants = (lesson.bookings ?? []).filter(row => !clientIds || clientIds.includes(row.clientId));
    if (!lesson.trainer?.vkId && !participants.some(row => row.client?.vkUserId)) return;
    if (event === 'created' || event.startsWith('booking:')) {
      await queueTrainingConfirmation(tx, `lesson:${lesson.id}:${event}`, {
        startTime: lesson.startTime, endTime: lesson.endTime, trainer: lesson.trainer,
        trainingType: lesson.service.title || lesson.service.name,
        participants,
      });
      return;
    }
    const recipients = new Set<bigint>();
    const notifications = event === 'cancelled' && lesson.trainer?.vkId ? await tx.clubNotificationSettings.findUnique({ where: { id: 1 } }) : null;
    if (lesson.trainer?.vkId && (event !== 'cancelled' || notifications?.trainerCancellation !== false)) recipients.add(lesson.trainer.vkId);
    for (const booking of lesson.bookings ?? []) {
      if ((!clientIds || clientIds.includes(booking.clientId)) && booking.client?.vkUserId) recipients.add(booking.client.vkUserId);
    }
    if (!recipients.size) return;
    const format = (date: Date) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: CLUB_TIME_ZONE }).format(date);
    const message = `${title}: ${lesson.service.title || lesson.service.name}\n${format(lesson.startTime)} — ${format(lesson.endTime)} (${CLUB_TIME_ZONE})`
      + (previousStart ? `\nРанее: ${format(previousStart)}` : '') + `\nТренер: ${lesson.trainer.name}`
      + (event === 'cancelled' ? `\nПричина: ${lesson.bookings.map(b => b.cancellationReason).filter(Boolean).join('; ')}` : '');
    for (const peer of recipients) await queueVkNotification(tx, `lesson:${lesson.id}:${event}:${peer}`, peer, message);
  }

  private async notifyTelegramLesson(tx: TransactionClient, lesson: LessonDetails, event: string, title: string, clientIds?: string[], previousStart?: Date) {
    if (event === 'cancelled') await queueTelegramAdmins(tx, `admin:cancel:${lesson.id}`, telegramCancellation(lesson.startTime, lesson.endTime, lesson.bookings ?? []));
    if (!(lesson.bookings ?? []).some(row => row.client?.telegramUserId && (!clientIds || clientIds.includes(row.clientId)))) return;
    const when = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(lesson.startTime);
    const message = `${title}: ${lesson.service.title || lesson.service.name}\n${when} (Москва)`
      + (previousStart ? `\nРанее: ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(previousStart)} (Москва)` : '');
    for (const row of lesson.bookings ?? []) if ((!clientIds || clientIds.includes(row.clientId)) && row.client?.telegramUserId)
      await queueTelegram(tx, `client:${row.clientId}:lesson:${lesson.id}:${event}`, row.client.telegramUserId, event === 'cancelled' ? telegramCancellation(lesson.startTime, lesson.endTime, [row]) : message);
  }

  private async validateNoConflictsWithClient(
    client: LessonReader,
    trainerId: string,
    horseIds: readonly string[],
    start: Date,
    end: Date,
    excludeLessonId?: string,
    arenaId?: string,
  ): Promise<void> {
    const resources: Prisma.LessonWhereInput[] = [{ trainerId }];
    if (horseIds.length) resources.push({ bookings: { some: { horseId: { in: [...horseIds] } } } });
    if (arenaId) resources.push({ arenaId });
    const conflicts = await client.lesson.findMany({
      where: {
        status: { not: LessonStatus.CANCELLED },
        OR: resources,
        startTime: { lt: end },
        endTime: { gt: start },
        ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
      },
      select: {
        trainerId: true,
        arenaId: true,
        bookings: { where: horseIds.length ? { horseId: { in: [...horseIds] } } : undefined, select: { horseId: true } },
      },
    });

    if (conflicts.some((lesson) => lesson.bookings.some((booking) => booking.horseId && horseIds.includes(booking.horseId)))) {
      throw new ConflictException('Лошадь уже забронирована на это время');
    }
    // Trainer/arena capacity and client occupancy are enforced by shared booking rules.
  }

  private async getHorseWorkloadWithClient(
    client: WorkloadReader,
    horseId: string,
    date: LocalDateParts,
    additionalMinutes: number,
    excludeLessonId?: string,
  ): Promise<HorseWorkload> {
    const schedule = await this.getClubSchedule(client);
    const { open, close } = this.getWorkDayBounds(date, schedule);
    const horse = await client.horse.findUnique({
      where: { id: horseId },
      select: { name: true, deletedAt: true, maxDailyMinutes: true, isUnavailable: true, healthStatus: true },
    });
    if (!horse) {
      throw new NotFoundException('Лошадь не найдена');
    }

    const lessons = await client.lesson.findMany({
      where: {
        bookings: { some: { horseId } },
        status: { not: LessonStatus.CANCELLED },
        startTime: { lt: close },
        endTime: { gt: open },
        ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
      },
      select: { startTime: true, endTime: true },
    });
    const usedMinutes = lessons.reduce((total, lesson) => {
      const duration = (lesson.endTime.getTime() - lesson.startTime.getTime()) /
        MILLISECONDS_PER_MINUTE;
      return total + Math.ceil(Math.max(0, duration));
    }, 0);

    if (additionalMinutes > 0 && horse.healthStatus && horse.healthStatus !== 'HEALTHY') throw new BadRequestException(`Лошадь «${horse.name}» на лечении, карантине или выбыла: тренировка запрещена`);
    if (additionalMinutes > 0 && (horse.deletedAt || horse.isUnavailable)) throw new ConflictException(`Лошадь "${horse.name}" недоступна`);
    if (additionalMinutes > 0 && usedMinutes + additionalMinutes > horse.maxDailyMinutes) {
      throw new ConflictException(
        `Превышен суточный лимит нагрузки лошади "${horse.name}": ` +
          `занято ${usedMinutes} из ${horse.maxDailyMinutes} мин.`,
      );
    }

    return {
      maxDailyMinutes: horse.maxDailyMinutes,
      usedMinutes,
      remainingMinutes: Math.max(0, horse.maxDailyMinutes - usedMinutes),
    };
  }

  private async getClubSchedule(
    client: Pick<WorkloadReader, 'clubSchedule'>,
  ): Promise<ClubScheduleConfig> {
    const schedule = await client.clubSchedule.findUnique({
      where: { id: CLUB_SCHEDULE_ID },
      select: { openTime: true, closeTime: true, daysOfWeekOff: true, weekDays: true },
    });
    if (!schedule) {
      throw new InternalServerErrorException('Расписание клуба не настроено');
    }
    return schedule;
  }

  private assertClubWorkingHours(
    startTime: Date,
    endTime: Date,
    schedule: ClubScheduleConfig,
  ): void {
    const startDate = this.getLocalDateParts(startTime);
    const endDate = this.getLocalDateParts(endTime);
    const dayOfWeek = new Date(
      Date.UTC(startDate.year, startDate.month - 1, startDate.day),
    ).getUTCDay();
    const sameLocalDate =
      startDate.year === endDate.year &&
      startDate.month === endDate.month &&
      startDate.day === endDate.day;
    const { open, close } = this.getWorkDayBounds(startDate, schedule);

    if (
      scheduleForDay(schedule, dayOfWeek || 7).daysOfWeekOff.includes(dayOfWeek) ||
      !sameLocalDate ||
      startTime < open ||
      endTime > close
    ) {
      throw new BadRequestException('Клуб закрыт в выбранное время/день');
    }
  }

  private getWorkDayBounds(
    date: LocalDateParts,
    schedule: ClubScheduleConfig,
  ): { open: Date; close: Date } {
    if (
      !Array.isArray(schedule.daysOfWeekOff) ||
      schedule.daysOfWeekOff.length > 7 ||
      new Set(schedule.daysOfWeekOff).size !== schedule.daysOfWeekOff.length ||
      schedule.daysOfWeekOff.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
    ) {
      throw new InternalServerErrorException('Некорректно настроены выходные дни клуба');
    }
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() || 7;
    const daily = scheduleForDay(schedule, weekday);
    const openTime = this.parseClock(daily.openTime);
    const closeTime = this.parseClock(daily.closeTime);
    if (
      closeTime.hour < openTime.hour ||
      (closeTime.hour === openTime.hour && closeTime.minute <= openTime.minute)
    ) {
      throw new InternalServerErrorException('Некорректно настроены часы работы клуба');
    }
    return {
      open: this.localDateTimeToUtc(date, openTime.hour, openTime.minute),
      close: this.localDateTimeToUtc(date, closeTime.hour, closeTime.minute),
    };
  }

  private parseClock(value: string): { hour: number; minute: number } {
    const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
    if (!match) {
      throw new InternalServerErrorException('Некорректный формат времени клуба');
    }
    const [hour, minute] = value.split(':').map(Number);
    return { hour, minute };
  }

  private parseCalendarDate(value: string): LocalDateParts {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new BadRequestException('Дата должна иметь формат YYYY-MM-DD');
    }
    const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
    if (
      check.getUTCFullYear() !== date.year ||
      check.getUTCMonth() + 1 !== date.month ||
      check.getUTCDate() !== date.day
    ) {
      throw new BadRequestException('Указана некорректная дата');
    }
    return date;
  }

  private getLocalDateParts(date: Date): LocalDateParts {
    const parts = this.getZonedParts(date);
    return { year: parts.year, month: parts.month, day: parts.day };
  }

  private localDateTimeToUtc(
    date: LocalDateParts,
    hour: number,
    minute: number,
  ): Date {
    const desired = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
    let timestamp = desired;
    // Итерация компенсирует UTC offset выбранной IANA-зоны, включая DST-зоны.
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const actual = this.getZonedParts(new Date(timestamp));
      const represented = Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute,
        actual.second,
      );
      const correction = desired - represented;
      timestamp += correction;
      if (correction === 0) break;
    }
    return new Date(timestamp);
  }

  private getZonedParts(date: Date): LocalDateParts & {
    hour: number;
    minute: number;
    second: number;
  } {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: CLUB_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const values = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second,
    };
  }

  private parseDate(value: string, errorMessage: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestException(errorMessage);
    }
    return date;
  }

  private assertValidInterval(start: Date, end: Date): void {
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start >= end
    ) {
      throw new BadRequestException(
        'Время окончания должно быть позже времени начала',
      );
    }
  }

  private async runSerializable<T>(
    operation: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        });
      } catch (error: unknown) {
        if (this.isSerializationFailure(error) && attempt < SERIALIZATION_RETRIES) {
          continue;
        }
        throw error;
      }
    }
    throw new InternalServerErrorException('Транзакция не была выполнена');
  }

  private isSerializationFailure(error: unknown): boolean {
    return (
      isSerializationFailure(error)
    );
  }
}
