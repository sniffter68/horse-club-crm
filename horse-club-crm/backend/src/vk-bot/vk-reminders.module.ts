import { Injectable, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { queueVkNotification } from './vk-delivery.module';
import { reminderKey, type ReminderKind } from './vk-reminder-key';
import { reminderMessage, reminderWindow } from './vk-reminder-message';

@Injectable()
export class VkReminders implements OnModuleInit {
  private readonly logger = new Logger(VkReminders.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.tick();
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { timeZone: 'Europe/Moscow', waitForCompletion: true })
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const kind of ['24h', '2h'] as const) await this.queueWindow(now, kind);
    } catch {
      this.logger.warn({ event: 'vk_reminders_unavailable', message: 'Не удалось проверить напоминания о тренировках' });
    } finally { this.running = false; }
  }

  private async queueWindow(now: Date, kind: ReminderKind): Promise<void> {
    const startTime = reminderWindow(now, kind);
    // Lesson is authoritative for legacy participants; standalone bookings own their time.
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'scheduled', attendanceStatus: 'PENDING', clientCancellationRequested: false, client: { vkUserId: { not: null } },
        OR: [
          { lesson: { is: { status: 'SCHEDULED', startTime } } },
          { lessonId: null, startTime },
        ],
      },
      include: { client: true, horse: true, trainer: true,
        lesson: { include: { trainer: true } } },
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
      return [{ booking, peer, start, key: reminderKey(kind, booking.id, start, peer) }];
    });
    if (!candidates.length) return;
    const existing = await this.prisma.vkNotification.findMany({
      where: { key: { in: candidates.map(row => row.key) } }, select: { key: true },
    });
    const queued = new Set(existing.map(row => row.key));
    for (const { booking, peer, start, key } of candidates) {
      if (queued.has(key)) continue;
      try {
        const firstName = booking.client.firstName.trim() || booking.client.name.trim().split(/\s+/)[0] || 'гость';
        const trainer = booking.lesson?.trainer || booking.trainer;
        const message = reminderMessage(kind, start, firstName, trainer.name, booking.horse?.name);
        // Unique upsert also protects against simultaneous ticks in multiple processes.
        await queueVkNotification(this.prisma, key, peer, message);
        this.logger.log({ event: 'vk_reminder_queued', bookingId: booking.id, key, peerId: String(peer) });
      } catch {
        this.logger.warn({ event: 'vk_reminder_queue_failed', bookingId: booking.id, peerId: String(peer) });
      }
    }
  }
}

@Module({ imports: [PrismaModule], providers: [VkReminders] })
export class VkRemindersModule {}
