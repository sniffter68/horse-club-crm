import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentsService, type BookingPaymentOption, type PaymentWithRelations } from './payments.service';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) response: Response): Promise<PaymentWithRelations[]> {
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

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<PaymentWithRelations> { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreatePaymentDto): Promise<PaymentWithRelations> { return this.service.create(dto); }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdatePaymentDto): Promise<PaymentWithRelations> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<PaymentWithRelations> { return this.service.remove(id); }
}
