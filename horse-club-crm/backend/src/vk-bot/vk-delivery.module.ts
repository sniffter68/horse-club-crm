import { Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { VK } from 'vk-io';
import type { Prisma } from '@prisma/client';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

// Persist alongside the business change; VK is contacted only after commit.
export async function queueVkNotification(tx: Prisma.TransactionClient, key: string, peerId: bigint, message: string): Promise<void> {
  await tx.vkNotification.upsert({ where: { key }, update: {}, create: { key, peerId, message } });
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
    const token = process.env.VK_COMMUNITY_TOKEN?.trim() || process.env.VK_BOT_TOKEN?.trim();
    if (token) this.vk = new VK({ token, apiVersion: '5.199', apiTimeout: 5000, apiRetryLimit: 0 });
  }
  onModuleInit() {
    if (!this.vk) return;
    this.timer = setInterval(() => { void this.flush(); }, 1000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async flush(): Promise<void> {
    if (this.running || !this.vk) return;
    this.running = true;
    try {
      const rows = await this.prisma.vkNotification.findMany({ where: { sentAt: null, nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 20 });
      for (const row of rows) {
        try {
          await this.vk.api.messages.send({ peer_id: Number(row.peerId), message: row.message, random_id: createHash('sha256').update(row.id).digest().readInt32BE(0) || 1 });
          await this.prisma.vkNotification.update({ where: { id: row.id }, data: { sentAt: new Date() } });
        } catch (error: unknown) {
          // Failed recipients must not occupy every slot in the next batch.
          const delay = Math.min(3600000, 10000 * 2 ** Math.min(row.attemptCount, 9));
          try {
            await this.prisma.vkNotification.update({ where: { id: row.id }, data: {
              attemptCount: { increment: 1 }, nextAttemptAt: new Date(Date.now() + delay),
            } });
          } catch { this.logger.warn('Не удалось обновить время повторной доставки VK'); }
          this.logger.warn({
            message: `Не удалось отправить VK-уведомление для userId: ${row.peerId}`,
            notificationId: row.id, attemptCount: row.attemptCount + 1,
            errorCode: typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined,
            errorMessage: error instanceof Error ? error.message : 'Неизвестная ошибка VK',
          });
        }
      }
    } catch { this.logger.warn('Очередь VK временно недоступна'); }
    finally { this.running = false; }
  }
}
@Module({ imports: [PrismaModule], providers: [VkNotifications] })
export class VkDeliveryModule {}
