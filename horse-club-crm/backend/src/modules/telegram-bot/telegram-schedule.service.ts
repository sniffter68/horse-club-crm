import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { BookingStatus, LessonStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from '../../settings/module-access.service';

export const CLUB_TIMEZONE = 'Europe/Moscow';
export const SCHEDULE_ACCESS_DENIED = 'Функция доступна только тренерам и персоналу клуба';
const cancelledBookings: BookingStatus[] = ['cancelled_client', 'cancelled_club', 'penalty_cancellation'];
const statuses: Record<LessonStatus | BookingStatus, string> = {
  SCHEDULED: 'Запланировано', COMPLETED: 'Состоялось', NO_SHOW: 'Неявка', CANCELLED: 'Отменено',
  scheduled: 'Запланировано', completed: 'Состоялось', no_show: 'Неявка',
  cancelled_client: 'Отменено клиентом', cancelled_club: 'Отменено клубом', penalty_cancellation: 'Отменено со штрафом',
};
const serviceTypes: Record<string, string> = {
  dressage: 'Выездка', jumping: 'Конкур', walks: 'Прогулка', beginners: 'Начальная подготовка',
  photoshoot: 'Фотосессия', corde: 'Корда',
};

/** Split plain text by UTF-16 length, preserving paragraphs and surrogate pairs. */
export function splitScheduleText(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 4096) {
    let end = remaining.lastIndexOf('\n\n', 4096);
    if (end <= 0) end = remaining.lastIndexOf('\n', 4096);
    if (end <= 0) end = 4096;
    const code = remaining.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end--;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

@Injectable()
export class TelegramScheduleService {
  constructor(private readonly prisma: PrismaService, private readonly access: ModuleAccessService) {}

  async authorize(sender: string) {
    const user = await this.prisma.user.findUnique({ where: { telegramUserId: sender }, include: { trainer: true, staffProfile: true } });
    if (!user || !['TRAINER', 'ADMIN'].includes(user.role) || user.trainer?.isActive === false || user.staffProfile?.isActive === false)
      throw new ForbiddenException(SCHEDULE_ACCESS_DENIED);
    const permission = (await this.access.forRole(user.role)).find(row => row.module === 'SCHEDULE');
    if (!permission?.isEnabled || user.role !== 'ADMIN' && permission.accessLevel === 'HIDDEN') throw new ForbiddenException(SCHEDULE_ACCESS_DENIED);
    return user;
  }

  async getDaySchedule(date: Date, requestingUserId?: string, showCancelled = false): Promise<string[]> {
    const day = DateTime.fromJSDate(date, { zone: CLUB_TIMEZONE }).startOf('day');
    if (!day.isValid) throw new BadRequestException('Некорректная дата расписания');
    const range = { gte: day.toJSDate(), lt: day.plus({ days: 1 }).toJSDate() };
    const bookingFilter = showCancelled ? {} : { status: { notIn: cancelledBookings } };
    const [lessons, standalone, requester] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { deletedAt: null, startTime: range, ...(showCancelled ? {} : { status: { not: LessonStatus.CANCELLED } }) },
        include: { trainer: true, service: true, bookings: { where: bookingFilter, include: { client: true, horse: true } } },
        orderBy: { startTime: 'asc' },
      }),
      // Older bookings have no Lesson. Linked bookings are rendered with their group above.
      this.prisma.booking.findMany({
        where: { lessonId: null, startTime: range, ...bookingFilter },
        include: { trainer: true, client: true, horse: true, membership: { include: { pricingPlan: true } } },
        orderBy: { startTime: 'asc' },
      }),
      requestingUserId ? this.prisma.user.findUnique({ where: { id: requestingUserId }, select: { trainerId: true } }) : null,
    ]);
    const trainer = (row: { trainerId: string; trainer: { name: string; fullName: string } }) =>
      row.trainerId === requester?.trainerId ? '🔹 Вы:' : `▫️ ${row.trainer.fullName || row.trainer.name}:`;
    const participant = (row: { client: { name: string; firstName: string; lastName: string }; horse: { name: string } | null }) =>
      `Клиент: ${row.client.name || [row.client.firstName, row.client.lastName].filter(Boolean).join(' ') || 'Не указан'}${row.horse ? ` · Лошадь: ${row.horse.name}` : ''}`;
    const time = (date: Date) => DateTime.fromJSDate(date, { zone: CLUB_TIMEZONE }).toFormat('HH:mm');
    const rows = [
      ...lessons.map(row => ({ start: row.startTime, text: `${time(row.startTime)} – ${time(row.endTime)}\n${trainer(row)} ${row.service.title || row.service.name}\n${row.bookings.map(participant).join('\n') || 'Участники не назначены'}\nСтатус: ${statuses[row.status]}` })),
      ...standalone.map(row => ({ start: row.startTime, text: `${time(row.startTime)} – ${time(row.endTime)}\n${trainer(row)} ${row.membership?.pricingPlan?.name || (row.serviceType && serviceTypes[row.serviceType]) || 'Занятие'}\n${participant(row)}\nСтатус: ${statuses[row.status]}` })),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());
    const weekday = day.setLocale('ru').toFormat('cccc');
    const title = `🗓 Расписание клуба на ${day.toFormat('dd.MM.yyyy')} (${weekday[0].toUpperCase()}${weekday.slice(1)})\nВсего занятий: ${rows.length} шт.`;
    return splitScheduleText(`${title}\n\n${rows.length ? rows.map(row => row.text).join('\n\n') : 'На этот день тренировок не запланировано.'}`);
  }
}
