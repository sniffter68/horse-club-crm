import { BadRequestException, Body, Controller, ForbiddenException, Header, Headers, HttpCode, Logger, Post, ServiceUnavailableException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { vkCommunityId, vkConfirmationToken } from './vk-bot.config';
import { VkBotService } from './vk-bot.service';

@Controller()
export class VkBotController {
  private readonly logger = new Logger(VkBotController.name);
  constructor(private readonly bot: VkBotService) {}

  @Post(['vk/callback', 'vk/webhook', 'vk-bot/callback'])
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  callback(@Body() body: unknown, @Headers('x-vk-secret') vkHeaderSecret?: string, @Headers('secret') headerSecret?: string): string {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Некорректное событие VK');
    const event = body as Record<string, unknown>;
    const secret = process.env.VK_SECRET_KEY?.trim();
    if (!secret) throw new ServiceUnavailableException('Секрет VK Callback не настроен');
    const provided = event.secret ?? vkHeaderSecret ?? headerSecret;
    if (typeof provided !== 'string' || !timingSafeEqual(
      createHash('sha256').update(secret).digest(), createHash('sha256').update(provided).digest(),
    )) throw new ForbiddenException('Неверный секрет VK');
    const group = vkCommunityId();
    if (group && event.group_id !== Number(group)) throw new ForbiddenException('Неверная группа VK');
    if (typeof event.type !== 'string' || !event.type) throw new BadRequestException('Не указан тип события VK');
    if (event.type === 'confirmation') {
      const code = vkConfirmationToken();
      if (!code) throw new ServiceUnavailableException('Код подтверждения VK не настроен');
      return code;
    }
    // Acknowledge before waiting for VK or the database; contain asynchronous failures.
    if (event.type === 'message_new') {
      void this.bot.handleMessage(event.object, event.event_id).catch(() => this.logger.error('Не удалось обработать входящее сообщение VK'));
    }
    if (event.type === 'message_reply') {
      void this.bot.handleReply(event.object).catch(() => this.logger.error('Не удалось включить паузу бота VK'));
    }
    if (event.type === 'message_event') {
      void this.bot.handleEvent(event.object).catch(() => this.logger.error('Не удалось обработать действие VK'));
    }
    return 'ok';
  }

}
