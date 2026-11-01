import { BadRequestException, Injectable, type OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { VK } from 'vk-io';
import { PrismaService } from '../prisma/prisma.service';
import { VkBotService } from './vk-bot.service';
import { VkNotifications } from './vk-delivery.module';
import { vkCommunityId, vkConfirmationToken, vkGroupToken } from './vk-bot.config';

export type VkSettingsInput = { communityId?: string; accessToken?: string; confirmationToken?: string; secretKey?: string };
type Config = Required<VkSettingsInput>;
export const vkCallbackUrl = 'https://crm.horseclub68.ru/api/vk/callback';

@Injectable()
export class VkSettingsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly bot: VkBotService, private readonly notifications: VkNotifications) {}
  private current(): Config {
    return { communityId: vkCommunityId() || '', accessToken: vkGroupToken() || '', confirmationToken: vkConfirmationToken() || '', secretKey: process.env.VK_SECRET_KEY?.trim() || '' };
  }
  private key() {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) throw new ServiceUnavailableException('Не настроен ключ шифрования интеграции');
    return createHash('sha256').update(`horsecrm:vk-settings:v1:${secret}`).digest();
  }
  private seal(config: Config) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  private apply(config: Config) {
    Object.assign(process.env, { VK_COMMUNITY_ID: config.communityId, VK_ACCESS_TOKEN: config.accessToken,
      VK_CONFIRMATION_TOKEN: config.confirmationToken, VK_SECRET_KEY: config.secretKey });
    this.bot.refreshTransport(); this.notifications.refreshTransport();
  }
  async onModuleInit() {
    const row = await this.prisma.vkIntegrationSettings.findUnique({ where: { id: 1 } });
    if (!row) return;
    try {
      const bytes = Buffer.from(row.encryptedConfig, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', this.key(), bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const config: Config = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
      this.apply(config);
    } catch { throw new ServiceUnavailableException('Не удалось расшифровать настройки VK. Проверьте ключ JWT_SECRET.'); }
  }
  status() {
    const config = this.current();
    return { communityId: config.communityId, callbackUrl: vkCallbackUrl,
      configured: Object.values(config).every(Boolean), hasAccessToken: Boolean(config.accessToken),
      hasConfirmationToken: Boolean(config.confirmationToken), hasSecretKey: Boolean(config.secretKey) };
  }
  private candidate(input: VkSettingsInput): Config {
    const config = this.current();
    for (const field of ['communityId', 'accessToken', 'confirmationToken', 'secretKey'] as const) {
      if (input[field]?.trim()) config[field] = input[field]!.trim();
    }
    if (!/^[1-9]\d{0,14}$/.test(config.communityId) || !Number.isSafeInteger(Number(config.communityId)) || !config.accessToken || !config.confirmationToken || !config.secretKey)
      throw new BadRequestException('Укажите ID сообщества, токен доступа, ключ подтверждения и секретный ключ');
    return config;
  }
  private transport(config: Config) {
    return new VK({ token: config.accessToken, apiVersion: '5.199', apiTimeout: 5000, apiRetryLimit: 0 });
  }
  async check(input: VkSettingsInput) {
    const config = this.candidate(input);
    try {
      const vk = this.transport(config);
      const permissions = await vk.api.groups.getTokenPermissions({});
      if (!permissions.permissions.some(item => item.name === 'messages')) throw new Error('messages permission required');
      const confirmation = await vk.api.groups.getCallbackConfirmationCode({ group_id: Number(config.communityId) });
      if (confirmation.code !== config.confirmationToken) throw new Error('confirmation mismatch');
      return { connected: true, message: 'Токен сообщества и ключ подтверждения проверены. Подтвердите Callback URL в VK и включите message_new и message_event.' };
    } catch { throw new BadRequestException('Не удалось проверить VK. Проверьте ID сообщества, права токена на сообщения и ключ подтверждения.'); }
  }
  async save(input: VkSettingsInput, actorId: string) {
    const config = this.candidate(input);
    const encryptedConfig = this.seal(config);
    await this.prisma.vkIntegrationSettings.upsert({ where: { id: 1 }, create: { id: 1, encryptedConfig, updatedById: actorId }, update: { encryptedConfig, updatedById: actorId } });
    this.apply(config);
    return this.status();
  }
}
