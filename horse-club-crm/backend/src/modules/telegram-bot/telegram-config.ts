import { createDecipheriv, createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaService } from '../../prisma/prisma.service';

/** Same encrypted envelope as VK settings, with a separate encryption key domain. */
export async function resolveTelegramBotToken(prisma?: PrismaService): Promise<string | undefined> {
  const row = await prisma?.telegramIntegrationSettings?.findUnique({ where: { id: 1 } });
  if (row) {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Missing encryption key');
      const bytes = Buffer.from(row.encryptedConfig, 'base64');
      const key = createHash('sha256').update(`horsecrm:telegram-settings:v1:${secret}`).digest();
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const config: unknown = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
      if (!config || typeof config !== 'object' || !('botToken' in config) || typeof config.botToken !== 'string') throw new Error('Invalid configuration');
      if (config.botToken.trim()) return config.botToken.trim();
    } catch { throw new ServiceUnavailableException('Не удалось расшифровать настройки Telegram. Проверьте JWT_SECRET'); }
  }
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
}

export function telegramInitData(request: Pick<Request, 'get'>, body?: string): string {
  return /^tma\s+(.+)$/i.exec(request.get('Authorization') ?? '')?.[1]?.trim()
    || request.get('X-Telegram-Init-Data')?.trim() || body?.trim() || '';
}

export const telegramClientWhere = (id: string) => ({
  OR: [{ telegramUserId: id.trim() }, { telegramChatId: id.trim() }],
});
