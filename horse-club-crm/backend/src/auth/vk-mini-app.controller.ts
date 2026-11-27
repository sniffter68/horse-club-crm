import type { Request, Response } from 'express';
import { sessionCookieName, sessionCookieOptions } from './session-cookie';
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { VkMiniAppService } from './vk-mini-app.service';

export class VkMiniAppDto {
  @IsString() @MinLength(1) @MaxLength(16384)
  launchParams!: string;
}
export class VkMiniAppLinkDto extends VkMiniAppDto {
  @IsString() @MaxLength(32) @MinLength(10)
  phone!: string;
  @IsString() @Matches(/^\d{4}$/)
  code!: string;
}
@Controller('auth/vk-mini-app')
export class VkMiniAppController {
  constructor(private readonly vk: VkMiniAppService) {}
  @Post() @HttpCode(200)
  async login(@Body() dto: VkMiniAppDto, @Req() request?: Request, @Res({ passthrough: true }) response?: Response) {
    const result = await this.vk.login(dto.launchParams);
    if (result.status === 'LINKED' && result.role !== 'CLIENT' && response) {
      response.cookie(sessionCookieName(), result.access_token, sessionCookieOptions(request?.headers.origin));
    }
    response?.setHeader('Cache-Control', 'no-store');
    return result;
  }
  @Post('link') @HttpCode(200)
  link(@Body() dto: VkMiniAppLinkDto) { return this.vk.link(dto.launchParams, dto.phone, dto.code); }
}
