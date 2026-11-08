import { vkGroupToken } from './vk-bot.config';
import { Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { VK } from 'vk-io';
import type { Prisma } from '@prisma/client';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { reminderKey, reminderKind } from './vk-reminder-key';
import { reminderKeyboard } from './vk-booking-response';

const MAX_ATTEMPTS = 5;
const FATAL_VK_ERROR_CODES = new Set([900, 901, 902]);

// Persist alongside the business change; VK is contacted only after commit.
export async function queueVkNotification(tx: Prisma.TransactionClient, key: string, peerId: bigint, message: string): Promise<void> {
  await tx.vkNotification.upsert({ where: { key }, update: {}, create: { key, peerId, message } });
}

export async function queueVkAdminChatNotification(tx: Prisma.TransactionClient, key: string, message: string): Promise<number | undefined> {
  const peer = Number(process.env.VK_ADMIN_PEER_ID?.trim());
  if (!Number.isSafeInteger(peer) || peer <= 0) return undefined;
  await queueVkNotification(tx, `${key}:${peer}`, BigInt(peer), message);
  return peer;
}

export async function queueVkAdministratorNotification(tx: Prisma.TransactionClient, key: string, message: string): Promise<number> {
  const admins = await tx.user.findMany({ where: { role: 'ADMIN', vkUserId: { not: null } }, select: { vkUserId: true } });
  const recipients = new Set(admins.flatMap(admin => admin.vkUserId ? [admin.vkUserId] : []));
  const peer = Number(process.env.VK_ADMIN_PEER_ID);
  if (Number.isSafeInteger(peer) && peer > 0) recipients.add(BigInt(peer));
  for (const recipient of recipients) await queueVkNotification(tx, `${key}:${recipient}`, recipient, message);
  return recipients.size;
}

@Injectable()
export class VkNotifications implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private vk?: VK;
  private readonly logger = new Logger(VkNotifications.name);
  constructor(private readonly prisma: PrismaService) {
    const token = vkGroupToken();
    if (token) this.vk = new VK({ token, apiVersion: '5.199', apiTimeout: 5000, apiRetryLimit: 0 });
  }
  refreshTransport() {
    const token = vkGroupToken();
    this.vk = token ? new VK({ token, apiVersion: '5.199', apiTimeout: 5000, apiRetryLimit: 0 }) : undefined;
    if (this.vk && !this.timer) this.onModuleInit();
  }
  onModuleInit() {
    if (!this.vk) {
      this.logger.warn({ event: 'vk_delivery_disabled', message: 'Доставка VK отключена: задайте VK_ACCESS_TOKEN. Уведомления остаются в очереди.' });
      return;
    }
    if (this.timer) return;
    this.timer = setInterval(() => { void this.flush(); }, 1000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async discardStaleReminder(row: { id: string; key: string; peerId: bigint }): Promise<boolean> {
    const kind = reminderKind(row.key);
    if (!kind) return false;
    const booking = await this.prisma.booking.findUnique({
      where: { id: row.key.split(':')[1] }, include: { lesson: true, client: true },
    });
    const start = booking?.lesson?.startTime || booking?.startTime;
    if (booking && start && start > new Date() && booking.status === 'scheduled' && booking.attendanceStatus === 'PENDING' && !booking.clientCancellationRequested
      && (!booking.lesson || booking.lesson.status === 'SCHEDULED') && booking.client.vkUserId === row.peerId
      && reminderKey(kind, booking.id, start, row.peerId) === row.key) return false;
    await this.prisma.vkNotification.deleteMany({ where: { id: row.id, sentAt: null } });
    this.logger.warn({ event: 'vk_reminder_discarded', notificationId: row.id, key: row.key,
      message: 'Напоминание снято: занятие или получатель изменились либо время занятия уже наступило' });
    return true;
  }
  async flush(): Promise<void> {
    if (this.running || !this.vk) return;
    this.running = true;
    try {
      const rows = await this.prisma.vkNotification.findMany({ where: {
        sentAt: null, attemptCount: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() },
        OR: [
          { NOT: { OR: [{ key: { startsWith: 'reminder24h:' } }, { key: { startsWith: 'reminder2h:' } }] } },
          { attemptCount: 0 },
        ],
      }, orderBy: { createdAt: 'asc' }, take: 20 });
      for (const row of rows) {
        const isReminder = reminderKind(row.key) !== undefined;
        try {
          if (await this.discardStaleReminder(row)) continue;
          if (isReminder) {
            // Persist the attempt before contacting VK. Atomic claim prevents duplicate
            // attempts across workers and restarts, including blocked private messages.
            const claimed = await this.prisma.vkNotification.updateMany({
              where: { id: row.id, sentAt: null, attemptCount: 0 },
              data: { attemptCount: { increment: 1 } },
            });
            if (claimed.count === 0) continue;
          }
          await this.vk.api.messages.send({ peer_id: Number(row.peerId), message: row.message,
            ...(isReminder ? { keyboard: reminderKeyboard(row.key.split(':')[1]) } : {}),
            random_id: createHash('sha256').update(row.id).digest().readInt32BE(0) || 1 });
          await this.prisma.vkNotification.update({ where: { id: row.id }, data: { sentAt: new Date() } });
          this.logger.log({ event: 'vk_notification_sent', notificationId: row.id, key: row.key, peerId: String(row.peerId) });
        } catch (error: unknown) {
          const errorCode = typeof error === 'object' && error !== null && 'code' in error
            && typeof error.code === 'number' ? error.code : undefined;
          const fatal = errorCode !== undefined && FATAL_VK_ERROR_CODES.has(errorCode);
          const attemptCount = row.attemptCount + 1;
          const retryStopped = fatal || isReminder || attemptCount >= MAX_ATTEMPTS;
          // Failed recipients must not occupy every slot in the next batch.
          const delay = Math.min(3600000, 10000 * 2 ** Math.min(row.attemptCount, 9));
          try {
            if (!isReminder || fatal) {
              await this.prisma.vkNotification.update({ where: { id: row.id }, data: {
                // MAX_ATTEMPTS is the persisted terminal state; sentAt stays null.
                attemptCount: fatal ? MAX_ATTEMPTS : { increment: 1 },
                ...(!retryStopped ? { nextAttemptAt: new Date(Date.now() + delay) } : {}),
              } });
            }
          } catch { this.logger.warn('Не удалось обновить время повторной доставки VK'); }
          this.logger.warn({
            message: `Не удалось отправить VK-уведомление для userId: ${row.peerId}`,
            event: 'vk_notification_failed', notificationId: row.id, key: row.key, peerId: String(row.peerId), attemptCount,
            errorCode, retryStopped,
            reason: fatal ? 'fatal_vk_api_error' : retryStopped ? 'max_attempts' : 'temporary_error',
            errorMessage: error instanceof Error ? error.message : 'Неизвестная ошибка VK',
          });
        }
      }
    } catch { this.logger.warn('Очередь VK временно недоступна'); }
    finally { this.running = false; }
  }
}
@Module({ imports: [PrismaModule], providers: [VkNotifications], exports: [VkNotifications] })
export class VkDeliveryModule {}
