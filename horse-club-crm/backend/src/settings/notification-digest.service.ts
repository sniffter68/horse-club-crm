import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { queueTelegram } from '../modules/telegram-bot/telegram-delivery';

@Injectable()
export class NotificationDigestService {
  private running = false;
  private readonly logger = new Logger(NotificationDigestService.name);
  constructor(private readonly prisma: PrismaService) {}

  @Cron('* * * * *', { timeZone: 'Europe/Moscow', waitForCompletion: true })
  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const day = DateTime.fromJSDate(now, { zone: 'Europe/Moscow' });
      await this.prisma.$transaction(async tx => {
        const settings = await tx.clubNotificationSettings.findUnique({ where: { id: 1 } });
        if (!settings?.adminDigest || day.toFormat('HH:mm') < settings.adminDigestTime) return;
        const window = { gte: day.startOf('day').toJSDate(), lt: day.plus({ days: 1 }).startOf('day').toJSDate() };
        const [lessons, bookings, admins] = await Promise.all([
          tx.lesson.findMany({ where: { startTime: window, deletedAt: null }, select: { status: true } }),
          tx.booking.findMany({ where: { startTime: window, lessonId: null }, select: { status: true } }),
          tx.user.findMany({ where: { id: { in: settings.adminRecipientIds }, role: 'ADMIN', crmAccess: true,
            telegramUserId: { not: null } }, select: { telegramUserId: true } }),
        ]);
        const cancelled = lessons.filter(row => row.status === 'CANCELLED').length
          + bookings.filter(row => ['cancelled_client', 'cancelled_club', 'penalty_cancellation'].includes(row.status)).length;
        const message = `Сводка клуба за ${day.toFormat('dd.MM.yyyy')} (Москва)\nЗанятий: ${lessons.length + bookings.length}\nИз них отменено: ${cancelled}`;
        for (const admin of admins) if (admin.telegramUserId)
          await queueTelegram(tx, `admin:digest:${day.toISODate()}`, admin.telegramUserId, message);
      }, { isolationLevel: 'RepeatableRead' });
    } catch { this.logger.warn('Не удалось подготовить сводку клуба'); }
    finally { this.running = false; }
  }
}
