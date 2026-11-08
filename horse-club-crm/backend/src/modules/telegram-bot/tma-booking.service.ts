import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { BookingRulesService } from '../../bookings/booking-rules.service';
import { currentLeadConsentVersion } from '../../common/lead-consent';
import { isSerializationFailure } from '../../common/serialization-failure';
import { LessonsService } from '../../lessons/lessons.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { TmaBookingsQuery, TmaCreateBookingDto, TmaSlotsQuery } from './telegram-bot.dto';

const ZONE = 'Europe/Moscow';
const bookingView = {
  id: true, startTime: true, endTime: true, status: true, clientConfirmed: true,
  clientCancellationRequested: true, costAmount: true,
  trainer: { select: { name: true } },
  lesson: { select: { status: true, deletedAt: true, startTime: true, endTime: true,
    service: { select: { title: true, name: true } } } },
} satisfies Prisma.BookingSelect;

@Injectable()
export class TmaBookingService {
  constructor(private readonly prisma: PrismaService, private readonly rules: BookingRulesService,
    private readonly lessons: LessonsService) {}

  async services() {
    const services = await this.prisma.service.findMany({ where: { isPublic: true, durationMinutes: { gt: 0 } },
      orderBy: [{ order: 'asc' }, { id: 'asc' }], take: 100,
      select: { id: true, title: true, name: true, description: true, price: true, durationMinutes: true } });
    return { services, consentVersion: currentLeadConsentVersion() };
  }

  private date(value: string) {
    const day = DateTime.fromISO(value, { zone: ZONE });
    const today = DateTime.now().setZone(ZONE).startOf('day');
    if (!day.isValid || day.toISODate() !== value || day < today || day > today.plus({ days: 30 })) {
      throw new BadRequestException('Выберите дату в ближайшие 30 дней');
    }
    return day;
  }

  private async service(tx: Prisma.TransactionClient, id?: string) {
    const service = await tx.service.findFirst({ where: { ...(id ? { id } : {}), isPublic: true, durationMinutes: { gt: 0 } },
      orderBy: [{ order: 'asc' }, { id: 'asc' }] });
    if (!service) throw new NotFoundException('Услуга недоступна для онлайн-записи');
    return service;
  }

  private async withinHours(tx: Prisma.TransactionClient, start: DateTime, minutes: number): Promise<boolean> {
    const schedule = await this.schedule(tx);
    const open = schedule.openTime, close = schedule.closeTime;
    const off = schedule.daysOfWeekOff;
    const end = start.plus({ minutes });
    return !off.includes(start.weekday % 7) && start.toISODate() === end.toISODate()
      && start.toFormat('HH:mm') >= open && end.toFormat('HH:mm') <= close && start.toMillis() > Date.now();
  }

  private async schedule(tx: Prisma.TransactionClient) {
    const schedule = await tx.clubSchedule.findUnique({ where: { id: 1 } });
    const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!schedule || !clock.test(schedule.openTime) || !clock.test(schedule.closeTime) || schedule.closeTime <= schedule.openTime
      || schedule.daysOfWeekOff.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new ServiceUnavailableException('Расписание клуба не настроено. Позвоните в клуб');
    }
    return schedule;
  }

  async slots(clientId: string, query: TmaSlotsQuery) {
    const day = this.date(query.date);
    return this.prisma.$transaction(async tx => {
      const service = await this.service(tx, query.serviceId);
      const trainers = await tx.trainer.findMany({ where: { isPublic: true, isActive: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }], take: 50, select: { id: true, name: true } });
      const schedule = await this.schedule(tx);
      if (schedule.daysOfWeekOff.includes(day.weekday % 7)) return { slots: [] };
      const slots: { startTime: string; endTime: string; trainers: { id: string; name: string }[] }[] = [];
      const open = DateTime.fromISO(`${query.date}T${schedule.openTime}`, { zone: ZONE });
      const close = DateTime.fromISO(`${query.date}T${schedule.closeTime}`, { zone: ZONE });
      for (let start = open; start.plus({ minutes: service.durationMinutes }) <= close; start = start.plus({ minutes: 30 })) {
        if (start.toMillis() <= Date.now()) continue;
        const end = start.plus({ minutes: service.durationMinutes });
        const available: typeof trainers = [];
        for (const trainer of trainers) {
          try {
            await this.rules.validate(tx, { trainerId: trainer.id, participants: [{ clientId }],
              start: start.toJSDate(), end: end.toJSDate(), lockResources: false });
            available.push(trainer);
          } catch (error: unknown) {
            if (!(error instanceof HttpException) || ![400, 409].includes(error.getStatus())) throw error;
          }
        }
        if (available.length) slots.push({ startTime: start.toISO()!, endTime: end.toISO()!, trainers: available });
      }
      return { slots };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 }); }
      catch (error: unknown) {
        if (!isSerializationFailure(error)) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Данные изменились. Проверьте «Мои записи» и повторите');
          throw error;
        }
      }
    }
    throw new ConflictException('Слот изменился. Обновите доступное время');
  }

  async create(clientId: string, dto: TmaCreateBookingDto) {
    if (!dto.consentAccepted || dto.consentVersion !== currentLeadConsentVersion()) throw new BadRequestException('Обновите приложение и подтвердите актуальное согласие');
    return this.serializable(async tx => {
      const previous = await tx.booking.findUnique({ where: { telegramRequestId: dto.requestId }, select: { ...bookingView, clientId: true } });
      if (previous) {
        if (previous.clientId !== clientId) throw new ConflictException('Повторите оформление записи');
        // A retry may only return the original result to its owner, with no private fields.
        return tx.booking.findUniqueOrThrow({ where: { id: previous.id }, select: bookingView });
      }
      const start = DateTime.fromISO(dto.startTime, { zone: ZONE });
      if (!start.isValid) throw new BadRequestException('Некорректное время');
      this.date(start.toISODate()!);
      const service = await this.service(tx, dto.serviceId);
      const schedule = await this.schedule(tx);
      const open = DateTime.fromISO(`${start.toISODate()}T${schedule.openTime}`, { zone: ZONE });
      if (start.second !== 0 || start.millisecond !== 0 || start.diff(open, 'minutes').minutes % 30 !== 0
        || !await this.withinHours(tx, start, service.durationMinutes)) throw new ConflictException('Время недоступно. Выберите другой слот');
      const trainer = await tx.trainer.findFirst({ where: { id: dto.trainerId, isPublic: true, isActive: true } });
      if (!trainer) throw new ConflictException('Тренер недоступен');
      const client = await tx.client.findUnique({ where: { id: clientId } });
      if (!client || client.deletedAt) throw new NotFoundException('Профиль недоступен');
      // A typed phone number is NOT proof of ownership of an existing CRM account.
      const phoneOwner = await tx.client.findUnique({ where: { phone: dto.phone }, select: { id: true } });
      if (phoneOwner && phoneOwner.id !== clientId) throw new ConflictException('Этот телефон уже есть в клубе. Позвоните +7 (915) 672-00-30 для привязки Telegram');
      await tx.client.update({ where: { id: clientId }, data: { phone: dto.phone } });
      const lesson = await this.lessons.createLesson({ serviceId: service.id, trainerId: trainer.id,
        startTime: start.toISO()!, participants: [{ clientId }] }, tx);
      return tx.booking.update({ where: { id: lesson.bookings[0].id }, data: { telegramRequestId: dto.requestId,
        telegramConsentVersion: dto.consentVersion, telegramConsentedAt: new Date() }, select: bookingView });
    });
  }

  async myBookings(clientId: string, query: TmaBookingsQuery) {
    const rows = await this.prisma.booking.findMany({ where: { clientId }, select: bookingView,
      orderBy: [{ startTime: 'desc' }, { id: 'desc' }], skip: query.offset, take: query.limit + 1 });
    return { bookings: rows.slice(0, query.limit), hasMore: rows.length > query.limit };
  }

  async cancelRequest(clientId: string, id: string) {
    return this.serializable(async tx => {
      const booking = await tx.booking.findFirst({ where: { id, clientId }, select: bookingView });
      if (!booking) throw new NotFoundException('Запись не найдена');
      const start = booking.lesson?.startTime ?? booking.startTime;
      if (booking.status !== 'scheduled' || (booking.lesson && (booking.lesson.deletedAt || booking.lesson.status !== 'SCHEDULED')) || start <= new Date()) throw new ConflictException('Запросить отмену можно только для предстоящего занятия');
      // Preserve the reservation and finances until an administrator handles it in CRM.
      return tx.booking.update({ where: { id }, data: { clientCancellationRequested: true, clientConfirmed: false }, select: bookingView });
    });
  }
}
