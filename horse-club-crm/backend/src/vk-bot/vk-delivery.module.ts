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

@Injectable()
export class VkNotifications implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private vk?: VK;
  private readonly logger = new Logger(VkNotifications.name);
  constructor(private readonly prisma: PrismaService) {
    if (process.env.VK_BOT_TOKEN) this.vk = new VK({ token: process.env.VK_BOT_TOKEN, apiTimeout: 5000, apiRetryLimit: 0 });
  }
  onModuleInit() {
    if (!process.env.VK_BOT_TOKEN) return;
    this.timer = setInterval(() => { void this.flush(); }, 10000);
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
        } catch {
          // Failed recipients must not occupy every slot in the next batch.
          const delay = Math.min(3600000, 10000 * 2 ** Math.min(row.attemptCount, 9));
          try {
            await this.prisma.vkNotification.update({ where: { id: row.id }, data: {
              attemptCount: { increment: 1 }, nextAttemptAt: new Date(Date.now() + delay),
            } });
          } catch { this.logger.warn('Не удалось обновить время повторной доставки VK'); }
          this.logger.warn('Уведомление VK сохранено для повторной отправки');
        }
      }
    } catch { this.logger.warn('Очередь VK временно недоступна'); }
    finally { this.running = false; }
  }
}
@Module({ imports: [PrismaModule], providers: [VkNotifications] })
export class VkDeliveryModule {}
