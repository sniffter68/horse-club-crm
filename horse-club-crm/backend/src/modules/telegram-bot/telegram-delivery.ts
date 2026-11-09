import { Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Api } from 'grammy';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaModule } from '../../prisma/prisma.module';

export async function queueTelegram(tx: Prisma.TransactionClient, key: string, peerId: string, message: string) {
  await tx.telegramNotification.upsert({ where: { key: `${key}:${peerId}` }, update: {}, create: { key: `${key}:${peerId}`, peerId, message } });
}

export async function queueTelegramAdmins(tx: Prisma.TransactionClient, key: string, message: string) {
  const admins = await tx.user.findMany({ where: { role: 'ADMIN', telegramUserId: { not: null } }, select: { telegramUserId: true, staffProfile: { select: { isActive: true } } } });
  for (const admin of admins) if (admin.telegramUserId && admin.staffProfile?.isActive !== false) await queueTelegram(tx, key, admin.telegramUserId, message);
}

@Injectable()
export class TelegramDelivery implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(TelegramDelivery.name);
  private api?: Api;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return;
    const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
    this.api = new Api(token, { ...(apiRoot ? { apiRoot } : {}), timeoutSeconds: 10 });
    this.timer = setInterval(() => { void this.flush(); }, 1000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async flush() {
    if (!this.api || this.running) return;
    this.running = true;
    try {
      const rows = await this.prisma.telegramNotification.findMany({ where: { sentAt: null, attempts: { lt: 5 }, nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 20 });
      for (const row of rows) {
        // Recheck recipient after unlink, archival or role changes; never deliver stale private data.
        const [client, user] = await Promise.all([
          this.prisma.client.findUnique({ where: { telegramUserId: row.peerId } }),
          this.prisma.user.findUnique({ where: { telegramUserId: row.peerId }, include: { staffProfile: true } }),
        ]);
        const allowed = row.key.startsWith('admin:') ? user?.role === 'ADMIN' && user.staffProfile?.isActive !== false
          : client && !client.deletedAt && row.key.startsWith(`client:${client.id}:`);
        if (!allowed) { await this.prisma.telegramNotification.update({ where: { key: row.key }, data: { attempts: 5 } }); continue; }
        const claimed = await this.prisma.telegramNotification.updateMany({ where: { key: row.key, sentAt: null, attempts: row.attempts },
          data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 60_000 * (row.attempts + 1)) } });
        if (!claimed.count) continue;
        try {
          await this.api.sendMessage(row.peerId, row.message);
          await this.prisma.telegramNotification.update({ where: { key: row.key }, data: { sentAt: new Date() } });
        } catch { this.logger.warn('Telegram delivery failed; retry scheduled, private data omitted'); }
      }
    } catch { this.logger.warn('Telegram notification queue temporarily unavailable'); }
    finally { this.running = false; }
  }
}

@Module({ imports: [PrismaModule], providers: [TelegramDelivery] })
export class TelegramDeliveryModule {}
