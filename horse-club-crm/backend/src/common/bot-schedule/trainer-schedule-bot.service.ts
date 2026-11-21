import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { BookingStatus, LessonStatus, Role } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from '../../settings/module-access.service';

export const CLUB_TIMEZONE = 'Europe/Moscow';
export const SCHEDULE_ACCESS_DENIED = 'Функция доступна только тренерам и персоналу клуба';
export type ScheduleMode = 'personal' | 'club';
export type ScheduleChannel = 'telegram' | 'vk';
export interface SchedulePrincipal { id: string; trainerId: string | null }

export function scheduleDay(value = 'today', now: Date = new Date()): DateTime {
  const today = DateTime.fromJSDate(now, { zone: CLUB_TIMEZONE }).startOf('day');
  const day = value === 'today' ? today : value === 'tomorrow' ? today.plus({ days: 1 })
    : /^\d{4}-\d{2}-\d{2}$/.test(value) ? DateTime.fromISO(value, { zone: CLUB_TIMEZONE }) : DateTime.invalid('Invalid schedule date');
  if (!day.isValid) throw new BadRequestException('Некорректная дата расписания');
  return day;
}

export function scheduleNavigation(mode: ScheduleMode, day: DateTime) {
  return [
    [{ label: '📅 Моё расписание', mode: 'personal' as const, date: day.toISODate()! },
      { label: '🗓 Общее расписание', mode: 'club' as const, date: day.toISODate()! }],
    [{ label: 'Сегодня', mode, date: 'today' }, { label: 'Завтра', mode, date: 'tomorrow' }],
    [{ label: '◀ Пред. день', mode, date: day.minus({ days: 1 }).toISODate()! },
      { label: 'Обновить', mode, date: day.toISODate()! },
      { label: 'След. день ▶', mode, date: day.plus({ days: 1 }).toISODate()! }],
  ];
}

const cancelledBookings: BookingStatus[] = ['cancelled_client', 'cancelled_club', 'penalty_cancellation'];
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
export class TrainerScheduleBotService {
  constructor(private readonly prisma: PrismaService, private readonly access: ModuleAccessService) {}

  async authorize(sender: string, channel: ScheduleChannel = 'telegram'): Promise<SchedulePrincipal> {
    if (!/^[1-9]\d{0,14}$/.test(sender)) throw new ForbiddenException(SCHEDULE_ACCESS_DENIED);
    const user = channel === 'telegram'
      ? await this.prisma.user.findUnique({ where: { telegramUserId: sender }, include: { trainer: true, staffProfile: true } })
      : await this.prisma.user.findFirst({ where: { OR: [{ vkId: sender }, { vkUserId: BigInt(sender) }] }, include: { trainer: true, staffProfile: true } });
    if (user) {
      if (!Object.values(Role).includes(user.role) || user.trainer?.isActive === false || user.staffProfile?.isActive === false)
        throw new ForbiddenException(SCHEDULE_ACCESS_DENIED);
      await this.checkPermission(user.role);
      return { id: user.id, trainerId: user.trainerId };
    }
    // VK supports binding directly through a trainer card, without a CRM login.
    if (channel === 'vk') {
      const trainer = await this.prisma.trainer.findUnique({ where: { vkId: BigInt(sender) }, include: { user: { include: { staffProfile: true } } } });
      if (trainer?.isActive && trainer.user?.staffProfile?.isActive !== false) {
        await this.checkPermission(trainer.user?.role ?? Role.TRAINER);
        return { id: trainer.user?.id ?? trainer.id, trainerId: trainer.id };
      }
    }
    throw new ForbiddenException(SCHEDULE_ACCESS_DENIED);
  }

  private async checkPermission(role: Role): Promise<void> {
    if (role === Role.ADMIN) return;
    const permission = (await this.access.forRole(role)).find(row => row.module === 'SCHEDULE');
    if (!permission?.isEnabled || permission.accessLevel === 'HIDDEN') throw new ForbiddenException(SCHEDULE_ACCESS_DENIED);
  }

  async getSchedule(channel: ScheduleChannel, sender: string, mode: ScheduleMode, date = 'today') {
    const principal = await this.authorize(sender, channel);
    const day = scheduleDay(date);
    return { day, chunks: await this.getDaySchedule(day.toJSDate(), principal, mode) };
  }

  private async getDaySchedule(date: Date, requester: SchedulePrincipal, mode: ScheduleMode): Promise<string[]> {
    const day = DateTime.fromJSDate(date, { zone: CLUB_TIMEZONE }).startOf('day');
    const title = `${mode === 'personal' ? '📅 Моё расписание' : '🗓 Общее расписание'} на ${day.setLocale('ru').toFormat('dd.MM.yyyy (cccc)')}`;
    if (mode === 'personal' && !requester.trainerId)
      return [`${title}\n\nК вашей учетной записи не привязан профиль тренера. Обратитесь к администратору клуба.\n\nИтого занятий: 0 шт.`];
    const trainerFilter = mode === 'personal' ? { trainerId: requester.trainerId! } : {};
    const range = { gte: day.toJSDate(), lt: day.plus({ days: 1 }).toJSDate() };
    const bookingFilter = { status: { notIn: cancelledBookings } };
    const [lessons, standalone] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { deletedAt: null, startTime: range, status: { not: LessonStatus.CANCELLED }, ...trainerFilter },
        include: { trainer: true, service: true, arena: true, bookings: { where: bookingFilter, include: { client: true, horse: true, arena: true }, orderBy: { id: 'asc' } } },
        orderBy: [{ startTime: 'asc' }, { trainerId: 'asc' }, { id: 'asc' }],
      }),
      // Older bookings have no Lesson. Linked bookings are rendered with their group above.
      this.prisma.booking.findMany({
        where: { lessonId: null, startTime: range, ...bookingFilter, ...trainerFilter },
        include: { trainer: true, client: true, horse: true, arena: true, membership: { include: { pricingPlan: true } } },
        orderBy: [{ startTime: 'asc' }, { trainerId: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const trainer = (row: { trainer: { name: string; fullName: string } }) => row.trainer.fullName || row.trainer.name;
    const participant = (row: { client: { name: string; firstName: string; lastName: string }; horse: { name: string } | null; arena: { name: string } | null }) =>
      `Всадник: ${row.client.name || [row.client.lastName, row.client.firstName].filter(Boolean).join(' ') || 'Не указан'}\nЛошадь: ${row.horse?.name || 'пока не назначена'}${row.arena ? `\nМанеж: ${row.arena.name}` : ''}`;
    const status = (value: LessonStatus | BookingStatus, confirmed: boolean) => {
      if (value === 'COMPLETED' || value === 'completed') return 'Проведено';
      if (value === 'NO_SHOW' || value === 'no_show') return 'Неявка';
      return confirmed ? 'Подтверждено' : 'Ожидает';
    };
    const time = (date: Date) => DateTime.fromJSDate(date, { zone: CLUB_TIMEZONE }).toFormat('HH:mm');
    const rows = [
      ...lessons.map(row => ({ start: row.startTime, trainer: trainer(row), id: row.id,
        text: `${time(row.startTime)}–${time(row.endTime)} · ${row.service.title || row.service.name}\nТренер: ${trainer(row)}${row.arena ? `\nМанеж: ${row.arena.name}` : ''}\n${row.bookings.map(b => `${participant(b)}\nСтатус: ${status(row.status === 'SCHEDULED' ? b.status : row.status, b.clientConfirmed)}`).join('\n') || `Участники не назначены\nСтатус: ${status(row.status, false)}`}` })),
      ...standalone.map(row => ({ start: row.startTime, trainer: trainer(row), id: row.id,
        text: `${time(row.startTime)}–${time(row.endTime)} · ${row.membership?.pricingPlan?.name || (row.serviceType && serviceTypes[row.serviceType]) || 'Занятие'}\nТренер: ${trainer(row)}\n${participant(row)}\nСтатус: ${status(row.status, row.clientConfirmed)}` })),
    ].sort((a, b) => a.start.getTime() - b.start.getTime() || a.trainer.localeCompare(b.trainer, 'ru') || a.id.localeCompare(b.id));
    return splitScheduleText(`${title}\n\n${rows.length ? rows.map(row => row.text).join('\n\n') : 'На этот день тренировок не запланировано.'}\n\n${mode === 'personal' ? 'Итого занятий' : 'Всего по клубу'}: ${rows.length} шт.`);
  }
}
