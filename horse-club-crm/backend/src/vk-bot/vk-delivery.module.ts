import { Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { VK } from 'vk-io';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VkNotifications implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(VkNotifications.name);
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    if (!process.env.VK_BOT_TOKEN) return;
    this.timer = setInterval(() => { void this.flush(); }, 10000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async flush(): Promise<void> {
    if (this.running || !process.env.VK_BOT_TOKEN) return;
    this.running = true;
    try {
      const vk = new VK({ token: process.env.VK_BOT_TOKEN, apiTimeout: 5000, apiRetryLimit: 0 });
      const rows = await this.prisma.vkNotification.findMany({ where: { sentAt: null }, orderBy: { createdAt: 'asc' }, take: 20 });
      for (const row of rows) {
        try {
          await vk.api.messages.send({ peer_id: Number(row.peerId), message: row.message, random_id: createHash('sha256').update(row.id).digest().readInt32BE(0) || 1 });
          await this.prisma.vkNotification.update({ where: { id: row.id }, data: { sentAt: new Date() } });
        } catch { this.logger.warn('Уведомление VK сохранено для повторной отправки'); }
      }
    } catch { this.logger.warn('Очередь VK временно недоступна'); }
    finally { this.running = false; }
  }
}
@Module({ imports: [PrismaModule], providers: [VkNotifications] })
export class VkDeliveryModule {}
