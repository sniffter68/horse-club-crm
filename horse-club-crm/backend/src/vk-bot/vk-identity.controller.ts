import { Controller, Get, Headers, Query, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Matches } from 'class-validator';
import { VkIdentityService } from './vk-identity.service';

export class IdentifyVkDto {
  @Matches(/^[1-9]\d{0,14}$/, { message: 'Укажите числовой VK ID' }) vkId!: string;
}

@Controller('vk')
export class VkIdentityController {
  constructor(private readonly identity: VkIdentityService) {}
  @Get('identify')
  identify(@Headers('x-bot-token') token: string | undefined, @Query() query: IdentifyVkDto) {
    const secret = process.env.VK_IDENTIFY_TOKEN?.trim();
    if (!secret) throw new ServiceUnavailableException('Сервисный токен VK не настроен');
    if (!token || !timingSafeEqual(createHash('sha256').update(secret).digest(), createHash('sha256').update(token).digest())) throw new UnauthorizedException('Неверный сервисный токен');
    return this.identity.identify(query.vkId);
  }
}
