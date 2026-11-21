import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { CashDeskService } from './cash-desk.service';
import { CashDeskPaymentDto, CashSummaryQueryDto, OpenCashShiftDto } from './dto/cash-desk.dto';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentsService, type BookingPaymentOption, type PaymentWithRelations } from './payments.service';
import { RequirePermission, RoleAccessGuard } from '../auth/role-access.guard';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard, RoleAccessGuard)
@Roles(Role.ADMIN, Role.MANAGER)
@RequireModule('CASHBOX')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService, private readonly cashDesk: CashDeskService) {}

  @Get()
  async findAll(@Query() query: PaymentQueryDto, @Res({ passthrough: true }) response: Response): Promise<PaymentWithRelations[]> {
    const { data, total } = await this.service.findAll(query);
    setRefineTotalHeaders(response, total);
    return data;
  }

  @Get('booking-options')
  async findBookingOptions(@Res({ passthrough: true }) response: Response): Promise<BookingPaymentOption[]> {
    const data = await this.service.findBookingOptions();
    setRefineTotalHeaders(response, data.length);
    return data;
  }

  @Post('cash-desk')
  pay(@Body() dto: CashDeskPaymentDto, @Req() req: { user: { id: string } }) { return this.cashDesk.pay(dto, req.user.id); }

  @Get('summary')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @RequirePermission('financeRead')
  summary(@Query() query: CashSummaryQueryDto) { return this.cashDesk.summary(query); }

  @Get('cash-desk/options/:clientId')
  options(@Param('clientId', new ParseUUIDPipe()) clientId: string) { return this.cashDesk.options(clientId); }

  @Get('shifts/current')
  currentShift(@Req() req: { user: { id: string } }) { return this.cashDesk.currentShift(req.user.id); }
  @Get('shifts')
  listShifts(@Req() req: { user: { id: string; role: Role } }) { return this.cashDesk.listShifts(req.user.role === Role.ADMIN ? undefined : req.user.id); }

  @Post('shifts')
  openShift(@Body() dto: OpenCashShiftDto, @Req() req: { user: { id: string } }) { return this.cashDesk.openShift(dto, req.user.id); }

  @Post('shifts/:id/close')
  closeShift(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: { user: { id: string } }) { return this.cashDesk.closeShift(id, req.user.id); }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<PaymentWithRelations> { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreatePaymentDto, @Req() req: { user: { id: string; email: string } }): Promise<PaymentWithRelations> { return this.service.create(dto, req.user); }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdatePaymentDto, @Req() req: { user: { id: string; email: string } }): Promise<PaymentWithRelations> {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: { user: { id: string; email: string } }): Promise<PaymentWithRelations> { return this.service.remove(id, req.user); }
}
