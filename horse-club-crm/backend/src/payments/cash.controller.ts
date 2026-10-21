import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import type { AuthUser } from '../auth/auth.types';
import { CashManagementService } from './cash-management.service';
import { ResetCashDto, WithdrawCashDto } from './dto/cash-management.dto';

@ApiTags('Cash')
@ApiBearerAuth()
@Controller('cash')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@RequireModule('CASHBOX')
@Roles(Role.ADMIN)
export class CashController {
  constructor(private readonly service: CashManagementService) {}

  @Post('reset')
  reset(@Body() dto: ResetCashDto, @Req() req: { user: AuthUser }) {
    return this.service.reset(dto, req.user);
  }

  @Post('withdraw')
  withdraw(@Body() dto: WithdrawCashDto, @Req() req: { user: AuthUser }) {
    return this.service.withdraw(dto, req.user);
  }
}
