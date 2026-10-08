import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { setRefineTotalHeaders } from '../common/refine';
import { BookingAvailabilityDto, ListBookingsDto } from './dto/booking-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingsService } from './bookings.service';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}
  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateBookingDto) { return this.bookings.createBooking(dto); }
  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CreateBookingDto) { return this.bookings.updateBooking(id, dto); }
  @Get('availability')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  availability(@Query() query: BookingAvailabilityDto) { return this.bookings.availability(query); }
  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async list(@Query() query: ListBookingsDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.bookings.findAll(query); setRefineTotalHeaders(response, result.total); return result.data;
  }
}
