import { isSerializationFailure } from '../common/serialization-failure';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { LessonStatus, MembershipOpType, Prisma } from '@prisma/client';
import { MembershipLedgerService } from '../memberships/membership-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLessonDto } from './dto/create-lesson.dto';
import type { ListLessonsQueryDto } from './dto/list-lessons-query.dto';

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
    horse: true,
    service: true,
    bookings: {
      include: { client: true, membership: true },
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
  dayOfWeekOff: number;
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

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipLedgerService: MembershipLedgerService,
  ) {}

  async validateNoConflicts(
    trainerId: string,
    horseId: string,
    start: Date,
    end: Date,
    excludeLessonId?: string,
  ): Promise<void> {
    this.assertValidInterval(start, end);
    await this.validateNoConflictsWithClient(
      this.prisma,
      trainerId,
      horseId,
      start,
      end,
      excludeLessonId,
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

  async getHorseWorkload(horseId: string, date: string): Promise<HorseWorkload> {
    return this.getHorseWorkloadWithClient(
      this.prisma,
      horseId,
      this.parseCalendarDate(date),
      0,
    );
  }

  async createLesson(dto: CreateLessonDto): Promise<LessonDetails> {
    if (dto.membershipId && !dto.clientId) {
      throw new BadRequestException('membershipId можно передать только вместе с clientId');
    }
    const start = this.parseDate(dto.startTime, 'Некорректное время начала занятия');

    return this.runSerializable(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id: dto.serviceId },
        select: { durationMinutes: true },
      });
      if (!service) {
        throw new NotFoundException('Услуга не найдена');
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
      const schedule = await this.getClubSchedule(tx);
      this.assertClubWorkingHours(start, end, schedule);
      await this.validateNoConflictsWithClient(
        tx,
        dto.trainerId,
        dto.horseId,
        start,
        end,
      );
      await this.getHorseWorkloadWithClient(
        tx,
        dto.horseId,
        this.getLocalDateParts(start),
        durationMinutes,
      );

      return tx.lesson.create({
        data: {
          trainerId: dto.trainerId,
          horseId: dto.horseId,
          serviceId: dto.serviceId,
          startTime: start,
          endTime: end,
          status: LessonStatus.SCHEDULED,
          ...(dto.clientId
            ? {
                bookings: {
                  create: {
                    clientId: dto.clientId,
                    ...(dto.membershipId
                      ? { membershipId: dto.membershipId }
                      : {}),
                  },
                },
              }
            : {}),
        },
        ...lessonDetails,
      });
    });
  }

  async findAll(query: ListLessonsQueryDto): Promise<LessonDetails[]> {
    const from = this.parseDate(query.from, 'Некорректный параметр from');
    const to = this.parseDate(query.to, 'Некорректный параметр to');
    if (from >= to) {
      throw new BadRequestException('Параметр from должен быть раньше параметра to');
    }

    return this.prisma.lesson.findMany({
      where: {
        ...(query.trainerId ? { trainerId: query.trainerId } : {}),
        ...(query.horseId ? { horseId: query.horseId } : {}),
        ...(query.status ? { status: query.status } : {}),
        // Возвращаем занятия, пересекающие полуоткрытый интервал [from, to).
        endTime: { gt: from },
        startTime: { lt: to },
      },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      ...lessonDetails,
    });
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

  async updateLessonStatus(
    lessonId: string,
    newStatus: LessonStatus,
  ): Promise<LessonDetails> {
    if (!ALLOWED_FINAL_STATUSES.has(newStatus)) {
      throw new BadRequestException('Недопустимый статус занятия');
    }

    return this.runSerializable(async (tx) => {
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        select: {
          status: true,
          bookings: { select: { membershipId: true } },
          operations: {
            where: {
              type: { in: [MembershipOpType.DEBIT, MembershipOpType.REFUND] },
            },
            select: { membershipId: true, type: true },
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
      const membershipIds = [
        ...new Set(
          lesson.bookings
            .map((booking) => booking.membershipId)
            .filter((id): id is string => id !== null),
        ),
      ].sort();
      const debitedMembershipIds = new Set(
        lesson.operations
          .filter((operation) => operation.type === MembershipOpType.DEBIT)
          .map((operation) => operation.membershipId),
      );
      const refundedMembershipIds = new Set(
        lesson.operations
          .filter((operation) => operation.type === MembershipOpType.REFUND)
          .map((operation) => operation.membershipId),
      );

      if (
        newStatus === LessonStatus.COMPLETED ||
        newStatus === LessonStatus.NO_SHOW
      ) {
        for (const membershipId of membershipIds) {
          if (!debitedMembershipIds.has(membershipId)) {
            await this.membershipLedgerService.debitLesson(
              membershipId,
              lessonId,
              newStatus === LessonStatus.COMPLETED
                ? 'Занятие завершено'
                : 'Неявка на занятие',
              tx,
            );
          }
        }
      } else {
        for (const membershipId of membershipIds) {
          if (
            debitedMembershipIds.has(membershipId) &&
            !refundedMembershipIds.has(membershipId)
          ) {
            await this.membershipLedgerService.refundLesson(
              membershipId,
              lessonId,
              'Отмена занятия',
              tx,
            );
          }
        }
      }

      return tx.lesson.update({
        where: { id: lessonId },
        data: { status: newStatus },
        ...lessonDetails,
      });
    });
  }

  private async validateNoConflictsWithClient(
    client: LessonReader,
    trainerId: string,
    horseId: string,
    start: Date,
    end: Date,
    excludeLessonId?: string,
  ): Promise<void> {
    const conflicts = await client.lesson.findMany({
      where: {
        status: { not: LessonStatus.CANCELLED },
        OR: [{ trainerId }, { horseId }],
        startTime: { lt: end },
        endTime: { gt: start },
        ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
      },
      select: { trainerId: true, horseId: true },
    });

    if (conflicts.some((lesson) => lesson.trainerId === trainerId)) {
      throw new ConflictException('Тренер уже занят в этот интервал времени');
    }
    if (conflicts.some((lesson) => lesson.horseId === horseId)) {
      throw new ConflictException('Лошадь уже забронирована на это время');
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
      select: { name: true, maxDailyMinutes: true },
    });
    if (!horse) {
      throw new NotFoundException('Лошадь не найдена');
    }

    const lessons = await client.lesson.findMany({
      where: {
        horseId,
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

    if (usedMinutes + additionalMinutes > horse.maxDailyMinutes) {
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
      select: { openTime: true, closeTime: true, dayOfWeekOff: true },
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
      dayOfWeek === schedule.dayOfWeekOff ||
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
      !Number.isInteger(schedule.dayOfWeekOff) ||
      schedule.dayOfWeekOff < 0 ||
      schedule.dayOfWeekOff > 6
    ) {
      throw new InternalServerErrorException('Некорректно настроен выходной день клуба');
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
