import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

export interface TelegramIdentity {
  telegramUserId: string;
  firstName: string;
  lastName: string;
  username?: string;
}

/** Only signed initData is trusted. Never accept initDataUnsafe as identity. */
export function validateTelegramInitData(raw: string, token: string, now = Date.now()): TelegramIdentity {
  const invalid = () => new UnauthorizedException('Откройте приложение заново через Telegram');
  if (!raw || raw.length > 16_384 || !token) throw invalid();
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw invalid();
  const hash = params.get('hash') ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(hash)) throw invalid();
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw invalid();
  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate * 1000 > now + 30_000 || now - authDate * 1000 > 3_600_000) throw invalid();
  let user: unknown;
  try { user = JSON.parse(params.get('user') ?? ''); } catch { throw invalid(); }
  if (!user || typeof user !== 'object' || !('id' in user) || !('first_name' in user)
    || typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0
    || typeof user.first_name !== 'string' || !user.first_name.trim() || user.first_name.length > 128) throw invalid();
  const lastName = 'last_name' in user ? user.last_name : '';
  const username = 'username' in user ? user.username : undefined;
  if (typeof lastName !== 'string' || lastName.length > 128 || (username !== undefined && (typeof username !== 'string' || username.length > 64))) throw invalid();
  return { telegramUserId: String(user.id), firstName: user.first_name, lastName, username };
}
