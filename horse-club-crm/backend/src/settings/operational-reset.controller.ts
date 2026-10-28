import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { OperationalResetService } from './operational-reset.service';
import { ResetOperationalDataDto } from './reset-operational-data.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(Role.ADMIN)
@RequireModule('CASHBOX', 'FULL')
export class OperationalResetController {
  constructor(private readonly service: OperationalResetService) {}

  @Post('reset-operational-data')
  @HttpCode(200)
  reset(@Body() dto: ResetOperationalDataDto, @CurrentUser() user: AuthUser) {
    return this.service.reset(dto, user);
  }
}
