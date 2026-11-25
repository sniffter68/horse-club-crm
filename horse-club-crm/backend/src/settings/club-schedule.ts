import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DateTime } from 'luxon';

export interface ClubWeekDay {
  dayOfWeek: number;
  isWorkingDay: boolean;
  openTime: string;
  closeTime: string;
}
export interface ScheduleSource {
  openTime: string;
  closeTime: string;
  daysOfWeekOff: number[];
  weekDays?: unknown;
}
export function scheduleWeekDays(schedule: ScheduleSource): ClubWeekDay[] {
  if (schedule.weekDays == null) return Array.from({ length: 7 }, (_, index) => ({
    dayOfWeek: index + 1, isWorkingDay: !schedule.daysOfWeekOff.includes((index + 1) % 7),
    openTime: schedule.openTime, closeTime: schedule.closeTime,
  }));
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const days: ClubWeekDay[] = [];
  if (Array.isArray(schedule.weekDays)) for (const value of schedule.weekDays as unknown[]) {
    if (typeof value !== 'object' || value === null) break;
    const row = value as Record<string, unknown>;
    if (typeof row.dayOfWeek !== 'number' || !Number.isInteger(row.dayOfWeek) || row.dayOfWeek < 1 || row.dayOfWeek > 7
      || typeof row.isWorkingDay !== 'boolean' || typeof row.openTime !== 'string' || typeof row.closeTime !== 'string'
      || !clock.test(row.openTime) || !clock.test(row.closeTime) || row.openTime >= row.closeTime) break;
    days.push({ dayOfWeek: row.dayOfWeek, isWorkingDay: row.isWorkingDay, openTime: row.openTime, closeTime: row.closeTime });
  }
  if (days.length !== 7 || new Set(days.map(day => day.dayOfWeek)).size !== 7)
    throw new InternalServerErrorException('Некорректно настроен график клуба');
  return days.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}
export function scheduleForDay(schedule: ScheduleSource, weekday: number): ScheduleSource {
  const day = scheduleWeekDays(schedule)[weekday - 1];
  if (!day) throw new InternalServerErrorException('Некорректный день недели');
  return { openTime: day.openTime, closeTime: day.closeTime, daysOfWeekOff: day.isWorkingDay ? [] : [weekday % 7] };
}

export function assertScheduleInterval(schedule: ScheduleSource | null, start: Date, end: Date): void {
  if (!schedule) throw new InternalServerErrorException('Расписание клуба не настроено');
  const from = DateTime.fromJSDate(start, { zone: 'Europe/Moscow' });
  const to = DateTime.fromJSDate(end, { zone: 'Europe/Moscow' });
  const day = scheduleForDay(schedule, from.weekday);
  if (day.daysOfWeekOff.length || from.toISODate() !== to.toISODate()
    || from.toFormat('HH:mm:ss.SSS') < `${day.openTime}:00.000` || to.toFormat('HH:mm:ss.SSS') > `${day.closeTime}:00.000`)
    throw new BadRequestException('Клуб закрыт в выбранное время/день');
}
