import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequireModule } from '../../auth/module-access.guard';
import { TelegramAuthGuard, type TelegramRequest } from './telegram-auth.guard';
import { TmaBookingsQuery, TmaCreateBookingDto, TmaSlotsQuery } from './telegram-bot.dto';
import { TmaBookingService } from './tma-booking.service';

@Controller('tma')
@RequireModule('SCHEDULE')
@UseGuards(TelegramAuthGuard)
export class TelegramBotController {
  constructor(private readonly service: TmaBookingService) {}
  @Get('services') @Header('Cache-Control', 'no-store')
  services() { return this.service.services(); }
  @Get('slots')
  slots(@Req() req: TelegramRequest, @Query() query: TmaSlotsQuery) { return this.service.slots(req.telegram.clientId, query); }
  @Post('bookings')
  create(@Req() req: TelegramRequest, @Body() dto: TmaCreateBookingDto) { return this.service.create(req.telegram.clientId, dto); }
  @Get('my-bookings') @Header('Cache-Control', 'no-store')
  bookings(@Req() req: TelegramRequest, @Query() query: TmaBookingsQuery) { return this.service.myBookings(req.telegram.clientId, query); }
  @Post('bookings/:id/cancel-request')
  cancel(@Req() req: TelegramRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.cancelRequest(req.telegram.clientId, id); }
}
