import { ReplaceHorseDto } from './dto/replace-horse.dto';
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
import { BookingLifecycleService } from './booking-lifecycle.service';
import { CancelBookingDto } from './dto/cancel-booking.dto';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService, private readonly lifecycle: BookingLifecycleService) {}
  @Patch(':id/horse')
  @Roles(Role.ADMIN, Role.MANAGER)
  replaceHorse(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ReplaceHorseDto) {
    return this.bookings.replaceHorse(id, dto.horseId, dto.reason);
  }
  @Patch(':id/complete')
  @Roles(Role.ADMIN, Role.MANAGER)
  complete(@Param('id', new ParseUUIDPipe()) id: string) { return this.lifecycle.transition(id, 'complete'); }
  @Patch(':id/no-show')
  @Roles(Role.ADMIN, Role.MANAGER)
  noShow(@Param('id', new ParseUUIDPipe()) id: string) { return this.lifecycle.transition(id, 'no-show'); }
  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.MANAGER)
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CancelBookingDto) { return this.lifecycle.transition(id, 'cancel', dto); }
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
