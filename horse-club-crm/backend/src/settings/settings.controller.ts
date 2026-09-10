import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateClubScheduleDto } from './dto/update-club-schedule.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
