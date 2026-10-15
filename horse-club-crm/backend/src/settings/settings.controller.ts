import { Body, Controller, Get, Param, ParseEnumPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateClubScheduleDto } from './dto/update-club-schedule.dto';
import { SettingsService } from './settings.service';
import { RoleAccessService } from '../auth/role-access.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UpdateRoleAccessDto } from './dto/update-role-access.dto';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService, private readonly access: RoleAccessService) {}

  @Get('access/me')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async currentAccess(@CurrentUser() user: AuthUser) {
    return { userId: user.id, trainerId: user.trainerId ?? null, role: user.role, permissions: await this.access.permissions(user.role) };
  }

  @Get('role-access')
  @Roles(Role.ADMIN)
  roles() { return this.access.list(); }

  @Patch('role-access/:role')
  @Roles(Role.ADMIN)
  updateAccess(@Param('role', new ParseEnumPipe(Role)) role: Role, @Body() dto: UpdateRoleAccessDto) { return this.access.update(role, dto); }

  @Get('club-schedule')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({ description: 'Глобальный график работы клуба.' })
  getSchedule() {
    return this.settingsService.getSchedule();
  }

  @Patch('club-schedule')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOkResponse({ description: 'График работы клуба обновлён.' })
  updateSchedule(@Body() dto: UpdateClubScheduleDto) {
    return this.settingsService.updateSchedule(dto);
  }
}
