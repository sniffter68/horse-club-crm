import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LessonStatus, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';

const CLUB_SCHEDULE_ID = 1;
const CLUB_TIME_ZONE = process.env.CLUB_TIME_ZONE ?? 'Europe/Moscow';
const ALERT_DELAY_MINUTES = 30;

export interface DashboardAlertBooking {
  id: string;
  client: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
  };
  horse: { id: string; name: string } | null;
  membershipId: string | null;
}

export interface DashboardAlert {
  id: string;
  startTime: Date;
  endTime: Date;
  trainer: { id: string; name: string };
  service: { id: string; name: string; title: string };
  bookings: DashboardAlertBooking[];
  unlinkedBookingsCount: number;
  hasUnlinkedMembership: boolean;
}

export interface DashboardHorseWorkload {
  horseId: string;
  horseName: string;
  maxDailyMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  loadPercent: number;
}

export interface DashboardSummary {
  generatedAt: Date;
  workDay: {
    date: string;
    openAt: Date;
    closeAt: Date;
    timeZone: string;
  };
  alerts: DashboardAlert[];
  horseWorkloads: DashboardHorseWorkload[];
  kpi: {
    lessonsTotal: number;
    lessonsCompleted: number;
    newLeads: number;
    activeMemberships: number;
  };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(now = new Date()): Promise<DashboardSummary> {
    const schedule = await this.prisma.clubSchedule.upsert({
      where: { id: CLUB_SCHEDULE_ID },
      update: {},
      create: { id: CLUB_SCHEDULE_ID },
      select: { openTime: true, closeTime: true },
    });
    const localNow = DateTime.fromJSDate(now, { zone: CLUB_TIME_ZONE });
    if (!localNow.isValid) {
      throw new InternalServerErrorException(
        `Некорректный часовой пояс клуба: ${CLUB_TIME_ZONE}`,
      );
    }

    const open = this.atClubTime(localNow, schedule.openTime, 'открытия');
    const close = this.atClubTime(localNow, schedule.closeTime, 'закрытия');
    if (close <= open) {
      throw new InternalServerErrorException(
        'Время закрытия клуба должно быть позже времени открытия',
      );
    }

    const openAt = open.toUTC().toJSDate();
    const closeAt = close.toUTC().toJSDate();
    const alertCutoff = new Date(now.getTime() - ALERT_DELAY_MINUTES * 60_000);
    const lessonDayFilter: Prisma.LessonWhereInput = {
      startTime: { gte: openAt },
      endTime: { lte: closeAt },
    };

    const [alertRows, horses, lessonsTotal, lessonsCompleted, newLeads, activeMemberships] =
      await Promise.all([
        this.prisma.lesson.findMany({
          where: {
            ...lessonDayFilter,
            endTime: { lt: alertCutoff, lte: closeAt },
            status: LessonStatus.SCHEDULED,
          },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            trainer: { select: { id: true, name: true } },
            service: { select: { id: true, name: true, title: true } },
            bookings: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                membershipId: true,
                client: {
                  select: {
                    id: true,
                    name: true,
                    firstName: true,
                    lastName: true,
                  },
                },
                horse: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ endTime: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.horse.findMany({
          where: { isUnavailable: false },
          select: {
            id: true,
            name: true,
            maxDailyMinutes: true,
            bookings: {
              where: {
                lesson: {
                  ...lessonDayFilter,
                  status: { not: LessonStatus.CANCELLED },
                },
              },
              select: {
                lesson: {
                  select: { id: true, startTime: true, endTime: true },
                },
              },
            },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.lesson.count({
          where: {
            ...lessonDayFilter,
            status: { not: LessonStatus.CANCELLED },
          },
        }),
        this.prisma.lesson.count({
          where: { ...lessonDayFilter, status: LessonStatus.COMPLETED },
        }),
        this.prisma.leadRequest.count({
          where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000), lte: now } },
        }),
        this.prisma.membership.count({
          where: { validUntil: { gte: now }, remainedLessons: { gt: 0 } },
        }),
      ]);

    const alerts: DashboardAlert[] = alertRows.map((lesson) => {
      const unlinkedBookingsCount = lesson.bookings.filter(
        (booking) => booking.membershipId === null,
      ).length;
      return {
        ...lesson,
        unlinkedBookingsCount,
        hasUnlinkedMembership: unlinkedBookingsCount > 0,
      };
    });

    const horseWorkloads: DashboardHorseWorkload[] = horses.map((horse) => {
      const uniqueLessons = new Map(
        horse.bookings.map(({ lesson }) => [lesson.id, lesson]),
      );
      const usedMinutes = [...uniqueLessons.values()].reduce(
        (total, lesson) =>
          total +
          Math.ceil(
            Math.max(0, lesson.endTime.getTime() - lesson.startTime.getTime()) /
              60_000,
          ),
        0,
      );
      const maxDailyMinutes = Math.max(0, horse.maxDailyMinutes);
      return {
        horseId: horse.id,
        horseName: horse.name,
        maxDailyMinutes,
        usedMinutes,
        remainingMinutes: Math.max(0, maxDailyMinutes - usedMinutes),
        loadPercent:
          maxDailyMinutes > 0
            ? Math.round((usedMinutes / maxDailyMinutes) * 100)
            : usedMinutes > 0
              ? 100
              : 0,
      };
    });

    return {
      generatedAt: now,
      workDay: {
        date: localNow.toISODate()!,
        openAt,
        closeAt,
        timeZone: CLUB_TIME_ZONE,
      },
      alerts,
      horseWorkloads,
      kpi: { lessonsTotal, lessonsCompleted, newLeads, activeMemberships },
    };
  }

  private atClubTime(
    date: DateTime,
    clock: string,
    label: string,
  ): DateTime {
    const match = /^(\d{2}):(\d{2})$/.exec(clock);
    if (!match) {
      throw new InternalServerErrorException(
        `Некорректное время ${label} клуба`,
      );
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) {
      throw new InternalServerErrorException(
        `Некорректное время ${label} клуба`,
      );
    }
    return date.startOf('day').set({ hour, minute });
  }
}
