import { MonthlyClosingService } from './monthly-closing.service';
import { MonthlyClosingDto } from './dto/monthly-closing.dto';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateExpenseDto, ExpenseQueryDto } from './dto/expense.dto';
import { CashSummaryQueryDto } from './dto/cash-desk.dto';
import { FinanceService } from './finance.service';

@ApiTags('Finance')
@ApiBearerAuth()
@RequireModule('CASHBOX')
@Controller('finance')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class FinanceController {
  constructor(private readonly service: FinanceService, private readonly monthlyClosing: MonthlyClosingService) {}
  @Get('monthly-closing/status')
  closingStatus(@Query() dto: MonthlyClosingDto) { return this.monthlyClosing.status(dto); }
  @Post('monthly-closing/close')
  @Roles(Role.ADMIN)
  closeMonth(@Body() dto: MonthlyClosingDto, @Req() req: { user: { id: string } }) { return this.monthlyClosing.close(dto, req.user.id); }
  @Post('expenses')
  create(@Body() dto: CreateExpenseDto, @Req() req: { user: { id: string } }) { return this.service.create(dto, req.user.id); }
  @Get('expenses')
  list(@Query() query: ExpenseQueryDto) { return this.service.list(query); }
  @Delete('expenses/:id')
  @Roles(Role.ADMIN)
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: { user: { id: string; role: Role } }) { return this.service.cancel(id, req.user); }
  @Get('summary')
  summary(@Query() query: CashSummaryQueryDto) { return this.service.summary(query); }
}
