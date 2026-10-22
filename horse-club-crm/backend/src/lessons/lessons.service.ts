import { canUseMembership, membershipAccessWhere } from '../memberships/membership-access';
import type { AuthUser } from '../auth/auth.types';
import type { CompleteLessonDto } from './dto/lesson-payment.dto';
import { money, paymentStatus, postLessonReceipt } from './lesson-finance';
import { isSerializationFailure } from '../common/serialization-failure';
import { BookingRulesService } from '../bookings/booking-rules.service';
import { randomUUID } from 'node:crypto';
import { queueVkNotification } from '../vk-bot/vk-delivery.module';
import { queueTrainingConfirmation } from '../vk-bot/vk-training-notifications';
import {
  BadRequestException,
  ConflictException,
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
      this.prisma.horse.findMany({ select: { id: true, name: true, maxDailyMinutes: true, isUnavailable: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
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

  async rescheduleLesson(lessonId: string, startTime: string, durationMinutes: number): Promise<LessonDetails> {
    const eventId = randomUUID();
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) throw new BadRequestException('Укажите положительную длительность занятия');
    const start = this.parseDate(startTime, 'Некорректное время начала занятия');
    const end = new Date(start.getTime() + durationMinutes * MILLISECONDS_PER_MINUTE);
    this.assertValidInterval(start, end);
    return this.runSerializable(async tx => {
      const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, ...lessonDetails });
      if (!lesson) throw new NotFoundException('Занятие не найдено');
      if (lesson.status !== LessonStatus.SCHEDULED) throw new ConflictException('Переносить можно только запланированные занятия');
      if (lesson.arena?.isUnavailable) throw new ConflictException('Манеж недоступен на новое время занятия');
      const schedule = await this.getClubSchedule(tx);
      this.assertClubWorkingHours(start, end, schedule);
      for (const booking of lesson.bookings) {
        if (booking.membership && (booking.membership.remainedLessons <= 0 || booking.membership.validUntil < end)) {
          throw new ConflictException('Абонемент участника недоступен на новое время занятия');
        }
      }
      const horseIds = [...new Set(lesson.bookings.map(booking => booking.horseId).filter((id): id is string => Boolean(id)))];
      await this.bookingRules.validate(tx, { trainerId: lesson.trainerId, arenaId: lesson.arenaId, participants: lesson.bookings, start, end, excludeLessonId: lessonId });
      await this.validateNoConflictsWithClient(tx, lesson.trainerId, horseIds, start, end, lessonId, lesson.arenaId ?? undefined);
      for (const horseId of horseIds) {
        await this.getHorseWorkloadWithClient(tx, horseId, this.getLocalDateParts(start), durationMinutes, lessonId);
      }
      const updated = await tx.lesson.update({ where: { id: lessonId }, data: { startTime: start, endTime: end }, ...lessonDetails });
      if (lesson.startTime.getTime() !== start.getTime() || lesson.endTime.getTime() !== end.getTime()) {
        await this.notifyLesson(tx, updated, `rescheduled:${eventId}`, 'Тренировка перенесена', undefined, lesson.startTime);
      }
      return updated;
    });
  }

  async createLesson(dto: CreateLessonDto, transaction?: Prisma.TransactionClient, actor?: AuthUser): Promise<LessonDetails> {
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
      let arenaCapacity: number | undefined;
      if (dto.arenaId) {
        const arena = await tx.arena.findUnique({
          where: { id: dto.arenaId },
          select: { name: true, isUnavailable: true, capacity: true },
        });
        if (!arena) throw new NotFoundException('Манеж не найден');
        if (arena.isUnavailable) throw new ConflictException(`Манеж "${arena.name}" недоступен`);
        arenaCapacity = arena.capacity;
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
          select: { id: true, clientId: true, remainedLessons: true, validUntil: true, deletedAt: true, status: true } });
        if (!membership || !await canUseMembership(tx, membership, participant.clientId)) {
          throw new BadRequestException('Абонемент не принадлежит участнику');
        }
        if (membership.deletedAt || membership.status !== 'active' || membership.remainedLessons <= 0 || membership.validUntil < end) {
          throw new BadRequestException('Абонемент недоступен на время занятия');
        }
      }
      const schedule = await this.getClubSchedule(tx);
      this.assertClubWorkingHours(start, end, schedule);
      const matchingLesson = participants.length && !perPerson
        ? await tx.lesson.findFirst({
            where: {
              trainerId: dto.trainerId,
              serviceId: dto.serviceId,
              arenaId: dto.arenaId ?? null,
              startTime: start,
              endTime: end,
              status: LessonStatus.SCHEDULED,
              pricePerPerson: null,
            },
            select: {
              id: true, cost: true, prepaymentAmount: true, finalPaymentAmount: true,
              bookings: { select: { clientId: true, horseId: true, membershipId: true, costAmount: true } },
            },
          })
        : null;
      if (matchingLesson) {
        const totalParticipants = matchingLesson.bookings.length + participants.length;
        if (totalParticipants > service.maxCapacity) {
          throw new ConflictException(`В занятии уже достигнута вместимость услуги: ${service.maxCapacity}`);
        }
        if (arenaCapacity !== undefined && totalParticipants > arenaCapacity) {
          throw new ConflictException(`В занятии уже достигнута вместимость манежа: ${arenaCapacity}`);
        }
        if (matchingLesson.bookings.some(booking => clientIds.includes(booking.clientId))) {
          throw new ConflictException('Клиент уже записан на это занятие');
        }
        if (matchingLesson.bookings.some(booking => booking.horseId && horseIds.includes(booking.horseId))) {
          throw new ConflictException('Лошадь уже назначена участнику этого занятия');
        }
      }
      await this.bookingRules.validate(tx, { trainerId: dto.trainerId, arenaId: dto.arenaId, participants, start, end,
        excludeLessonId: matchingLesson?.id, existingRiders: matchingLesson?.bookings.length });
      await this.validateNoConflictsWithClient(
        tx,
        dto.trainerId,
        horseIds,
        start,
        end,
        matchingLesson?.id,
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

      if (matchingLesson) {
        const previousCost = new Prisma.Decimal(matchingLesson.cost ?? matchingLesson.bookings
          .filter(b => !b.membershipId).reduce((sum, b) => sum.plus(b.costAmount ?? 0), new Prisma.Decimal(0)));
        const combinedCost = money(previousCost.plus(totalCost));
        const combinedPrepayment = new Prisma.Decimal(matchingLesson.prepaymentAmount ?? 0).plus(prepayment);
        const updated = await tx.lesson.update({
          where: { id: matchingLesson.id },
          data: { cost: combinedCost, prepaymentAmount: combinedPrepayment,
            paymentStatus: paymentStatus(combinedCost, combinedPrepayment.plus(matchingLesson.finalPaymentAmount ?? 0)),
            bookings: { create: bookingCreateData } },
          ...lessonDetails,
        });
        await this.recordPrepayment(tx, updated, clientIds[0], prepayment, dto.prepaymentMethod, actor);
        await this.notifyLesson(tx, updated, `booking:${[...clientIds].sort().join(',')}`, 'Новая запись на тренировку', clientIds);
        return updated;
      }

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
          paymentStatus: paymentStatus(totalCost, prepayment),
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
      where: {
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

  async deleteLesson(lessonId: string, actor: AuthUser) {
    return this.runSerializable(async (tx) => {
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        include: { bookings: { include: { membership: true, client: true } }, operations: true },
      });
      if (!lesson) throw new NotFoundException('Занятие не найдено');

      const reason = `Удаление занятия ${lessonId}; пользователь ${actor.id}; ${new Date().toISOString()}`;
      const opKey = (op: { membershipId: string; attendeeClientId?: string | null }) => `${op.membershipId}:${op.attendeeClientId ?? ''}`;
      const refunded = new Set(lesson.operations.filter(op => op.type === 'REFUND').map(opKey));
      // The ledger is authoritative: scheduled visits and already refunded visits
      // must never receive an extra credit. Include debits from former participants.
      const debits = lesson.operations.filter(op => op.type === 'DEBIT' && !refunded.has(opKey(op)))
        .sort((a, b) => a.membershipId.localeCompare(b.membershipId));
      for (const debit of debits) {
        await this.membershipLedgerService.refundLesson(debit.membershipId, lessonId, reason, tx, debit.attendeeClientId ?? undefined);
      }
      // Retain both DEBIT and REFUND history, including the original lesson ID.
      // SetNull alone would lose that context once the lesson is gone.
      const operations = await tx.membershipOp.findMany({ where: { lessonId }, select: { id: true, reason: true } });
      for (const operation of operations) {
        await tx.membershipOp.update({ where: { id: operation.id },
          data: { lessonId: null, reason: operation.reason.includes(reason) ? operation.reason : `${operation.reason}\n${reason}` } });
      }
      // Cash receipts and purchase ledger entries retain their booking, actor,
      // amount and timestamps. Only unpaid charges are cancelled, never refunded.
      await tx.payment.updateMany({ where: { booking: { lessonId }, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      for (const booking of lesson.bookings) {
        await tx.booking.updateMany({ where: { id: booking.id, lessonId }, data: {
          lessonId: null, legacyLessonBinding: true, status: 'cancelled_club',
          cancellationReason: [booking.cancellationReason, `${reason}; исходный статус ${booking.status}`].filter(Boolean).join('\n'),
        } });
      }
      await tx.lesson.delete({ where: { id: lessonId } });
      return { success: true, message: 'Занятие успешно удалено' };
    });
  }

  async updateLessonStatus(
    lessonId: string,
    newStatus: LessonStatus,
    payment: CompleteLessonDto = {},
    actor?: AuthUser,
  ): Promise<LessonDetails> {
    if (!ALLOWED_FINAL_STATUSES.has(newStatus)) {
      throw new BadRequestException('Недопустимый статус занятия');
    }

    return this.runSerializable(async (tx) => {
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        select: {
          status: true, cost: true, prepaymentAmount: true, finalPaymentAmount: true, startTime: true, serviceId: true,
          service: { select: { allowMembership: true } },
          bookings: { select: { id: true, clientId: true, membership: { select: { clientId: true } }, membershipId: true, costAmount: true, prepaymentAmount: true, finalPaymentAmount: true, isPaid: true, client: { select: { name: true } }, payments: { where: { status: 'PAID' }, select: { amount: true } } } },
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
      if (lesson.status === newStatus) {
        return tx.lesson.findUniqueOrThrow({
          where: { id: lessonId },
          ...lessonDetails,
        });
      }
      if (lesson.status === LessonStatus.CANCELLED) {
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
      for (const participant of participantsToCharge) {
        // Historical operations without attendee identity belong to the purchaser.
        const matching = lesson.operations.filter(op => op.membershipId === participant.membershipId
          && (op.attendeeClientId === participant.clientId || (!op.attendeeClientId
            && lesson.bookings.some(b => b.clientId === participant.clientId && b.membership?.clientId === participant.clientId))));
        const debit = matching.find(op => op.type === MembershipOpType.DEBIT);
        const refund = matching.find(op => op.type === MembershipOpType.REFUND);
        if (newStatus === LessonStatus.COMPLETED || newStatus === LessonStatus.NO_SHOW) {
          if (!debit) await this.membershipLedgerService.debitLesson(participant.membershipId, lessonId,
            newStatus === LessonStatus.COMPLETED ? 'Занятие завершено' : 'Неявка на занятие', tx, participant.clientId);
        } else if (debit && !refund) {
          await this.membershipLedgerService.refundLesson(participant.membershipId, lessonId, 'Отмена занятия', tx, debit.attendeeClientId ?? undefined);
        }
      }

      let financialData: Prisma.LessonUpdateInput = {};
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
        financialData = { cost, paymentStatus: paymentStatus(cost, previouslyPaid.plus(amount)),
          finalPaymentAmount: previouslyPaid.minus(prepaid).plus(amount),
          ...(amount.gt(0) ? { finalPaymentMethod: payment.paymentMethod } : {}) };
      }
      const updated = await tx.lesson.update({
        where: { id: lessonId },
        data: { status: newStatus, ...financialData },
        ...lessonDetails,
      });
      if (newStatus === LessonStatus.CANCELLED) await this.notifyLesson(tx, updated, 'cancelled', 'Тренировка отменена');
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
    const participants = (lesson.bookings ?? []).filter(row => !clientIds || clientIds.includes(row.clientId));
    if (!lesson.trainer?.vkUserId && !participants.some(row => row.client?.vkUserId)) return;
    if (event === 'created' || event.startsWith('booking:')) {
      await queueTrainingConfirmation(tx, `lesson:${lesson.id}:${event}`, {
        startTime: lesson.startTime, endTime: lesson.endTime, trainer: lesson.trainer,
        trainingType: lesson.service.title || lesson.service.name,
        participants,
      });
      return;
    }
    const recipients = new Set<bigint>();
    if (lesson.trainer?.vkUserId) recipients.add(lesson.trainer.vkUserId);
    for (const booking of lesson.bookings ?? []) {
      if ((!clientIds || clientIds.includes(booking.clientId)) && booking.client?.vkUserId) recipients.add(booking.client.vkUserId);
    }
    if (!recipients.size) return;
    const format = (date: Date) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: CLUB_TIME_ZONE }).format(date);
    const message = `${title}: ${lesson.service.title || lesson.service.name}\n${format(lesson.startTime)} — ${format(lesson.endTime)} (${CLUB_TIME_ZONE})`
      + (previousStart ? `\nРанее: ${format(previousStart)}` : '') + `\nТренер: ${lesson.trainer.name}`;
    for (const peer of recipients) await queueVkNotification(tx, `lesson:${lesson.id}:${event}:${peer}`, peer, message);
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

    if (conflicts.some((lesson) => lesson.trainerId === trainerId)) {
      throw new ConflictException('Тренер уже занят в этот интервал времени');
    }
    if (conflicts.some((lesson) => lesson.bookings.some((booking) => booking.horseId && horseIds.includes(booking.horseId)))) {
      throw new ConflictException('Лошадь уже забронирована на это время');
    }
    if (arenaId && conflicts.some((lesson) => lesson.arenaId === arenaId)) {
      throw new ConflictException('Манеж уже занят в это время');
    }
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
      select: { name: true, maxDailyMinutes: true, isUnavailable: true, healthStatus: true },
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
    if (additionalMinutes > 0 && horse.isUnavailable) throw new ConflictException(`Лошадь "${horse.name}" недоступна`);
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
      select: { openTime: true, closeTime: true, daysOfWeekOff: true },
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
      schedule.daysOfWeekOff.includes(dayOfWeek) ||
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
    const openTime = this.parseClock(schedule.openTime);
    const closeTime = this.parseClock(schedule.closeTime);
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
