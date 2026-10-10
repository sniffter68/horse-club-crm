import { Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { queueVkNotification } from './vk-delivery.module';
import { reminder24hKey } from './vk-reminder-key';

export const REMINDER_INTERVAL_MS = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const WINDOW = 15 * 60 * 1000;

@Injectable()
export class VkReminders implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VkReminders.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, REMINDER_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const startTime = { gte: new Date(+now + DAY - WINDOW), lte: new Date(+now + DAY + WINDOW) };
      // Lesson is authoritative for legacy participants; standalone bookings own their time.
      const bookings = await this.prisma.booking.findMany({
        where: {
          status: 'scheduled', attendanceStatus: 'PENDING',
          OR: [
            { lesson: { is: { status: 'SCHEDULED', startTime } } },
            { lessonId: null, startTime },
          ],
        },
        include: { client: true, horse: true, trainer: true, arena: true,
          lesson: { include: { trainer: true, arena: true } } },
      });
      const candidates = bookings.flatMap(booking => {
        const peer = booking.client.vkUserId;
        if (!peer || peer <= 0n || peer > BigInt(Number.MAX_SAFE_INTEGER)) {
          this.logger.warn({ event: 'vk_reminder_no_recipient', bookingId: booking.id, clientId: booking.clientId });
          return [];
        }
        const start = booking.lesson?.startTime || booking.startTime;
        // Persisted unique key is the audit flag, including pending/failed delivery.
        // A rescheduled training has a new key and can receive its own reminder.
        return [{ booking, peer, start, key: reminder24hKey(booking.id, start, peer) }];
      });
      if (!candidates.length) return;
      const existing = await this.prisma.vkNotification.findMany({
        where: { key: { in: candidates.map(row => row.key) } }, select: { key: true },
      });
      const queued = new Set(existing.map(row => row.key));
      const timeZone = process.env.CLUB_TIME_ZONE || 'Europe/Moscow';
      const date = new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
      const time = new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      for (const { booking, peer, start, key } of candidates) {
        if (queued.has(key)) continue;
        try {
          const firstName = booking.client.firstName.trim() || booking.client.name.trim().split(/\s+/)[0] || 'гость';
          const trainer = booking.lesson?.trainer || booking.trainer;
          const arena = booking.lesson ? booking.lesson.arena : booking.arena;
          const message = `Напоминание о тренировке 🐴\nЗдравствуйте, ${firstName}!\n`
            + `Завтра (${date.format(start)}) в ${time.format(start)} у вас запланировано занятие.\n`
            + `Тренер: ${trainer.name.trim() || 'пока не назначен'}\n`
            + `Лошадь: ${booking.horse?.name.trim() || 'пока не назначена'}\n`
            + `Локация: ${arena?.name.trim() || 'уточните у администратора'}\n\n`
            + 'Пожалуйста, приезжайте за 10–15 минут до начала. Если ваши планы изменились, предупредите клуб заранее.\n'
            + 'Связаться с администратором: отправьте «Позвать администратора» в этом диалоге.';
          // Unique upsert also protects against simultaneous ticks in multiple processes.
          await queueVkNotification(this.prisma, key, peer, message);
          this.logger.log({ event: 'vk_reminder_queued', bookingId: booking.id, key, peerId: String(peer) });
        } catch {
          this.logger.warn({ event: 'vk_reminder_queue_failed', bookingId: booking.id, peerId: String(peer) });
        }
      }
    } catch {
      this.logger.warn({ event: 'vk_reminders_unavailable', message: 'Не удалось проверить напоминания о тренировках' });
    } finally { this.running = false; }
  }
}

@Module({ imports: [PrismaModule], providers: [VkReminders] })
export class VkRemindersModule {}
