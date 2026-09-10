import { BadRequestException, Body, Controller, ForbiddenException, Header, Headers, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { VkBotService } from './vk-bot.service';

@Controller('vk')
export class VkBotController {
  constructor(private readonly bot: VkBotService) {}

  @Post('callback')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async callback(@Body() body: unknown, @Headers('secret') headerSecret?: string, @Headers('x-vk-secret') vkHeaderSecret?: string): Promise<string> {
    const secret = process.env.VK_SECRET_KEY;
    const group = process.env.VK_GROUP_ID;
    if (!secret || !group || !/^\d+$/.test(group) || !Number.isSafeInteger(Number(group)) || Number(group) <= 0) {
      throw new ServiceUnavailableException('VK Callback не настроен');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Некорректное событие VK');
    const event = body as Record<string, unknown>;
    const provided = event.secret ?? vkHeaderSecret ?? headerSecret;
    if (typeof provided !== 'string' || !timingSafeEqual(createHash('sha256').update(secret).digest(), createHash('sha256').update(provided).digest())
      || event.group_id !== Number(group)) throw new ForbiddenException('Неверный секрет или группа VK');
    if (typeof event.type !== 'string') throw new BadRequestException('Не указан тип события VK');
    if (event.type === 'confirmation') {
      const code = process.env.VK_CONFIRMATION_CODE;
      if (!code) throw new ServiceUnavailableException('Код подтверждения VK не настроен');
      return code;
    }
    if (event.type === 'message_new') await this.bot.handleMessage(event.object, event.event_id);
    if (event.type === 'message_event') await this.bot.handleEvent(event.object);
    return 'ok';
  }
}
