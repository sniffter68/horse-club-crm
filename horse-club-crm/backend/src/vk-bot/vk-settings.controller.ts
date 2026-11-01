import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { VkSettingsService } from './vk-settings.service';

export class UpdateVkSettingsDto {
  @Transform(({ value }) => value === '' ? undefined : value) @IsOptional() @Matches(/^[1-9]\d{0,14}$/) communityId?: string;
  @IsOptional() @IsString() @MaxLength(2048) accessToken?: string;
  @IsOptional() @IsString() @MaxLength(256) confirmationToken?: string;
  @IsOptional() @IsString() @MaxLength(256) secretKey?: string;
}

@Controller('settings/vk')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(Role.ADMIN)
@RequireModule('SCHEDULE')
export class VkSettingsController {
  constructor(private readonly settings: VkSettingsService) {}
  @Get() status() { return this.settings.status(); }
  @Post('check') check(@Body() input: UpdateVkSettingsDto) { return this.settings.check(input); }
  @Patch() save(@Body() input: UpdateVkSettingsDto, @CurrentUser() user: AuthUser) { return this.settings.save(input, user.id); }
}
