import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { CashboxService } from './cashbox.service';

@ApiTags('Cashbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
@RequireModule('CASHBOX')
@Controller('cashbox')
export class CashboxController {
  constructor(private readonly service: CashboxService) {}
  @Get('summary')
  summary() { return this.service.summary(); }
}
