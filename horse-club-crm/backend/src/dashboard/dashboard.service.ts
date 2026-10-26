import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AccessLevel, LeadRequestStatus, LessonStatus, Prisma, Role, SystemModule } from '@prisma/client';
import { DateTime } from 'luxon';
import { ModuleAccessService } from '../settings/module-access.service';
import { aggregatePaymentMethods } from '../payments/cash-desk.math';
import { currentCashBalance, expenseTotals } from '../payments/finance.service';
import { PrismaService } from '../prisma/prisma.service';

const CLUB_SCHEDULE_ID = 1;
const CLUB_TIME_ZONE = 'Europe/Moscow';
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

export interface DashboardLeadRequest {
  id: string;
  firstName: string;
  phone: string;
  email: string | null;
  preferences: string | null;
  createdAt: Date;
  service: { id: string; name: string; title: string } | null;
}

export interface DashboardSummary {
  todayLessons?: { total: number; completed: number; cancelled: number };
  cashboxSummary?: { cash: string; card: string; revenueToday: string; expensesToday: string };
  horsesStatus?: { total: number; healthy: number; treatment: number; quarantine: number };
  activeShifts?: number;
  onDutyStaff?: Array<{ id: string; staffId: string; fullName: string; roleTitle: string; startTime: string; endTime: string; status: string }>;
  pendingVetAlerts?: number;
  upcomingLessons?: Array<{ id: string; startTime: Date; endTime: Date; trainer: { name: string }; service: { name: string; title: string }; bookings: Array<{ client: { name: string }; horse: { name: string } | null }> }>;
  generatedAt: Date;
  workDay: {
    date: string;
    openAt: Date;
    closeAt: Date;
    timeZone: string;
  };
  alerts: DashboardAlert[];
  horseWorkloads: DashboardHorseWorkload[];
  leadRequests: DashboardLeadRequest[];
  kpi: {
    lessonsTotal: number;
    lessonsCompleted: number;
    newLeads: number;
    activeMemberships: number;
  };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly access: ModuleAccessService) {}

  async getSummary(role: Role, now = new Date()): Promise<DashboardSummary> {
    const permissions = await this.access.forRole(role);
    const canRead = (module: SystemModule) => permissions.some(row => row.module === module && row.isEnabled && row.accessLevel !== AccessLevel.HIDDEN);
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
    const dayStart = localNow.startOf('day').toJSDate();
    const dayEnd = localNow.startOf('day').plus({ days: 1 }).toJSDate();
    const lessonDayFilter: Prisma.LessonWhereInput = { startTime: { gte: dayStart, lt: dayEnd } };
    const operationalQuery = () => this.operationalSummary(canRead, lessonDayFilter, dayStart, dayEnd, now);

    const [alertRows, horses, lessonsTotal, lessonsCompleted, newLeads, activeMemberships, leadRequests, operational] =
      await Promise.all([
        canRead('SCHEDULE') ? this.prisma.lesson.findMany({
          where: {
            ...lessonDayFilter,
            endTime: { lt: alertCutoff, lte: closeAt },
            status: LessonStatus.SCHEDULED,
          },
          select: {
            id: true, cost: true, paymentStatus: true, prepaymentAmount: true, finalPaymentAmount: true,
            startTime: true,
            endTime: true,
            trainer: { select: { id: true, name: true } },
            service: { select: { id: true, name: true, title: true } },
            bookings: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                membershipId: true, costAmount: true, payments: { select: { status: true, amount: true } },
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
        }) : Promise.resolve([]),
        canRead('SCHEDULE') && canRead('STABLES') ? this.prisma.horse.findMany({
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
        }) : Promise.resolve([]),
        canRead('SCHEDULE') ? this.prisma.lesson.count({
          where: {
            ...lessonDayFilter,
            status: { not: LessonStatus.CANCELLED },
          },
        }) : Promise.resolve(0),
        canRead('SCHEDULE') ? this.prisma.lesson.count({
          where: { ...lessonDayFilter, status: LessonStatus.COMPLETED },
        }) : Promise.resolve(0),
        this.prisma.leadRequest.count({
          where: { status: LeadRequestStatus.PENDING },
        }),
        canRead('CASHBOX') ? this.prisma.membership.count({
          where: { deletedAt: null, status: 'active', validUntil: { gte: now }, remainedLessons: { gt: 0 } },
        }) : Promise.resolve(0),
        this.prisma.leadRequest.findMany({
          where: { status: LeadRequestStatus.PENDING },
          select: {
            id: true,
            firstName: true,
            phone: true,
            email: true,
            preferences: true,
            createdAt: true,
            service: { select: { id: true, name: true, title: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 100,
        }),
        operationalQuery(),
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
        horse.bookings.flatMap(({ lesson }) => lesson ? [[lesson.id, lesson] as const] : []),
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
      ...operational,
      generatedAt: now,
      workDay: {
        date: localNow.toISODate()!,
        openAt,
        closeAt,
        timeZone: CLUB_TIME_ZONE,
      },
      alerts,
      horseWorkloads,
      leadRequests,
      kpi: { lessonsTotal, lessonsCompleted, newLeads, activeMemberships },
    };
  }

  private async operationalSummary(canRead: (module: SystemModule) => boolean, lessonDay: Prisma.LessonWhereInput, start: Date, end: Date, now: Date) {
    const [lessonGroups, horses, shifts, pendingVetAlerts, upcomingLessons, cashboxSummary] = await Promise.all([
      canRead('SCHEDULE') ? this.prisma.lesson.groupBy({ by: ['status'], where: lessonDay, _count: { _all: true } }) : undefined,
      canRead('STABLES') ? this.prisma.horse.groupBy({ by: ['healthStatus'], _count: { _all: true } }) : undefined,
      canRead('STAFF_PAYROLL') ? this.prisma.workShift.findMany({
        where: { date: new Date(DateTime.fromJSDate(start, { zone: CLUB_TIME_ZONE }).toISODate()! + 'T00:00:00Z'), status: 'SCHEDULED', startedAt: { lte: now }, endedAt: null, staff: { isActive: true } },
        select: { id: true, staffId: true, startTime: true, endTime: true, status: true, staff: { select: { fullName: true, roleTitle: true } } },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      }) : undefined,
      canRead('VETERINARY') ? this.prisma.vetEvent.count({ where: { status: { in: ['scheduled', 'overdue'] }, eventDate: { lt: end } } }) : undefined,
      canRead('SCHEDULE') ? this.prisma.lesson.findMany({ where: { ...lessonDay, status: 'SCHEDULED', endTime: { gt: now } },
        select: { id: true, cost: true, paymentStatus: true, prepaymentAmount: true, finalPaymentAmount: true, startTime: true, endTime: true, trainer: { select: { name: true } }, service: { select: { name: true, title: true } },
          bookings: { select: { membershipId: true, costAmount: true, payments: { select: { amount: true, status: true } }, client: { select: { name: true } }, horse: { select: { name: true } } } } },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }], take: 10 }) : undefined,
      canRead('CASHBOX') ? this.cashboxSummary(start, end, now) : undefined,
    ]);
    const count = (status: string) => lessonGroups?.find(row => row.status === status)?._count._all ?? 0;
    const health = (status: string) => horses?.find(row => row.healthStatus === status)?._count._all ?? 0;
    return {
      ...(lessonGroups && { todayLessons: { total: lessonGroups.reduce((sum, row) => sum + row._count._all, 0), completed: count('COMPLETED'), cancelled: count('CANCELLED') } }),
      ...(horses && { horsesStatus: { total: horses.reduce((sum, row) => sum + row._count._all, 0), healthy: health('HEALTHY'), treatment: health('TREATMENT'), quarantine: health('QUARANTINE') } }),
      ...(shifts && { activeShifts: new Set(shifts.map(row => row.staffId)).size, onDutyStaff: shifts.map(({ staff, ...row }) => ({ ...row, ...staff })) }),
      ...(pendingVetAlerts !== undefined && { pendingVetAlerts }),
      ...(upcomingLessons && { upcomingLessons }),
      ...(cashboxSummary && { cashboxSummary }),
    };
  }

  private cashboxSummary(start: Date, end: Date, now: Date) {
    // Reuse cash-desk accounting rules: paid receipts minus non-cancelled expenses.
    // RepeatableRead keeps the four aggregates on the same ledger snapshot.
    return this.prisma.$transaction(async tx => {
      const [todayIncome, todayExpenses, balance] = await Promise.all([
        tx.payment.groupBy({ by: ['method'], where: { archivedAt: null, status: 'PAID', OR: [{ paidAt: { gte: start, lt: end } }, { paidAt: null, createdAt: { gte: start, lt: end } }] }, _sum: { amount: true }, _count: { _all: true } }),
        tx.expense.groupBy({ by: ['paymentMethod'], where: { archivedAt: null, cancelledAt: null, date: { gte: start, lt: end } }, _sum: { amount: true } }),
        currentCashBalance(tx, now),
      ]);
      return { cash: balance.balanceCash.toFixed(2), card: balance.balanceCard.toFixed(2),
        revenueToday: aggregatePaymentMethods(todayIncome).totalRevenue.toFixed(2), expensesToday: expenseTotals(todayExpenses).total.toFixed(2) };
    }, { isolationLevel: 'RepeatableRead' });
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
