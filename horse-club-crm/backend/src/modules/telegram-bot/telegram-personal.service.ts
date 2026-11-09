import { ForbiddenException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { LessonStatus } from '@prisma/client';
import { LessonsService } from '../../lessons/lessons.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from '../../settings/module-access.service';
import { activeTelegramMembership } from './telegram-membership';

export const telegramDate = (date: Date) => DateTime.fromJSDate(date).setZone('Europe/Moscow').toFormat('dd.MM HH:mm');

@Injectable()
export class TelegramPersonalService {
  constructor(private readonly prisma: PrismaService, private readonly access: ModuleAccessService, private readonly lessons: LessonsService) {}

  async user(sender: string, write = false) {
    const user = await this.prisma.user.findUnique({ where: { telegramUserId: sender }, include: { staffProfile: true, trainer: true } });
    if (!user || user.staffProfile?.isActive === false || user.trainer?.isActive === false) throw new ForbiddenException('Привяжите активный профиль сотрудника в CRM');
    const permissions = await this.access.forRole(user.role);
    const permission = permissions.find(row => row.module === (user.trainerId ? 'SCHEDULE' : 'STAFF_PAYROLL'));
    if (!permission?.isEnabled || permission.accessLevel === 'HIDDEN' || write && permission.accessLevel !== 'FULL') throw new ForbiddenException('Недостаточно прав для этого действия');
    return user;
  }

  async identity(sender: string) {
    const user = await this.prisma.user.findUnique({ where: { telegramUserId: sender } });
    return user ? (user.role === 'ADMIN' ? 'admin' : user.trainerId ? 'trainer' : 'staff') : 'client';
  }

  async schedule(sender: string, week: boolean) {
    const user = await this.user(sender);
    const start = DateTime.now().setZone('Europe/Moscow').startOf('day');
    const range = { gte: start.toJSDate(), lt: start.plus({ days: week ? 7 : 1 }).toJSDate() };
    if (user.trainerId) {
      const rows = await this.prisma.lesson.findMany({ where: { trainerId: user.trainerId, deletedAt: null, startTime: range },
        include: { service: true, bookings: { include: { client: true } } }, orderBy: { startTime: 'asc' }, take: 30 });
      return rows.map(row => ({ id: row.id, text: `${telegramDate(row.startTime)} — ${row.service.title || row.service.name}\n${row.bookings.map(b => b.client.name || b.client.firstName).join(', ')} · ${row.status}`, actionable: row.status === 'SCHEDULED' }));
    }
    if (!user.staffProfile) return [];
    const shifts = await this.prisma.workShift.findMany({ where: { staffId: user.staffProfile.id, date: range }, orderBy: { date: 'asc' }, take: 30 });
    return shifts.map(row => ({ id: row.id, text: `${telegramDate(row.date)} · ${row.startTime}–${row.endTime} · ${row.status}`, actionable: false }));
  }

  async status(sender: string, id: string, status: 'COMPLETED' | 'CANCELLED', refund = false) {
    const user = await this.user(sender, true);
    if (!user.trainerId) throw new ForbiddenException('Не назначен профиль тренера');
    return this.lessons.updateLessonStatus(id, LessonStatus[status], {}, user, { refund, reason: 'Отмена тренером через Telegram' }, sender);
  }

  private async client(sender: string) {
    const enabled = await this.prisma.clubModuleSettings.findUnique({ where: { module: 'SCHEDULE' } });
    if (enabled?.isEnabled === false) throw new ForbiddenException('Расписание временно отключено');
    const client = await this.prisma.client.findUnique({ where: { telegramUserId: sender } });
    if (!client || client.deletedAt) throw new ForbiddenException('Привяжите активную карточку клиента в CRM');
    return client;
  }

  async bookings(sender: string) {
    const client = await this.client(sender);
    const rows = await this.prisma.booking.findMany({ where: { clientId: client.id, startTime: { gte: new Date() }, OR: [{ lesson: null }, { lesson: { deletedAt: null } }] },
      include: { trainer: true }, orderBy: { startTime: 'asc' }, take: 20 });
    return rows.map(row => `${telegramDate(row.startTime)} · ${row.trainer.name} · ${row.status}`).join('\n') || 'Предстоящих записей нет';
  }

  async balance(sender: string) {
    const client = await this.client(sender);
    const membership = await activeTelegramMembership(this.prisma, client.id);
    if (!membership) return 'У вас нет активного абонемента. Для оформления обратитесь к администратору клуба.';
    const title = membership.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const until = DateTime.fromISO(membership.validUntil).setZone('Europe/Moscow').toFormat('dd.MM.yyyy');
    return `🎫 Ваш абонемент: <b>${title}</b>\nОстаток занятий: <b>${membership.remainingLessons} из ${membership.totalLessons}</b>\nДействует до: <b>${until}</b>`;
  }
}
