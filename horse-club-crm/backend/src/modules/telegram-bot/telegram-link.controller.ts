import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, UseGuards, Header } from '@nestjs/common';
import { IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ModuleAccessGuard, RequireModule } from '../../auth/module-access.guard';
import { TelegramLinkService } from './telegram-link.service';

export class TelegramLinkDto {
  @IsString() @IsNotEmpty() @MaxLength(256) username!: string;
}

@Controller('clients')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@RequireModule('SCHEDULE')
@Roles(Role.ADMIN, Role.MANAGER)
export class ClientTelegramLinkController {
  constructor(private readonly links: TelegramLinkService) {}
  @Get(':id/telegram') @Header('Cache-Control', 'no-store')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  status(@Param('id', ParseUUIDPipe) id: string) { return this.links.status('client', id); }
  @Patch(':id/telegram')
  save(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser, @Body() dto: TelegramLinkDto) { return this.links.save('client', id, actor, dto.username); }
  @Delete(':id/telegram')
  unlink(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) { return this.links.unlink('client', id, actor); }
}

@Controller('users')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@RequireModule('STAFF_PAYROLL')
@Roles(Role.ADMIN, Role.MANAGER)
export class UserTelegramLinkController {
  constructor(private readonly links: TelegramLinkService) {}
  @Get(':id/telegram') @Header('Cache-Control', 'no-store')
  status(@Param('id', ParseUUIDPipe) id: string) { return this.links.status('user', id); }
  @Patch(':id/telegram')
  save(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser, @Body() dto: TelegramLinkDto) { return this.links.save('user', id, actor, dto.username); }
  @Delete(':id/telegram')
  unlink(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) { return this.links.unlink('user', id, actor); }
}
