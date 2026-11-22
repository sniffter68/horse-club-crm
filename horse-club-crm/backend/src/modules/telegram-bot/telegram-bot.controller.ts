import { TelegramBotService } from './telegram-bot.service';
import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequireModule } from '../../auth/module-access.guard';
import { TelegramAuthGuard, type TelegramRequest } from './telegram-auth.guard';
import { TmaBookingsQuery, TmaCreateBookingDto, TmaSlotsQuery } from './telegram-bot.dto';
import { ClientMiniappService } from './client-miniapp.service';
import { ClientRescheduleDto, TrainerTmaScheduleQuery } from './trainer-tma.dto';
import { TmaBookingService } from './tma-booking.service';

@Controller(['tma', 'telegram-bot'])
@RequireModule('SCHEDULE')
@UseGuards(TelegramAuthGuard)
export class TelegramBotController {
  constructor(private readonly service: TmaBookingService, private readonly clients: ClientMiniappService, private readonly bot: TelegramBotService) {}
  @Post('client/request-contact')
  requestContact(@Req() req: TelegramRequest) { return this.bot.requestOwnContact(req.telegram.telegramUserId); }
  @Get('client/overview') @Header('Cache-Control', 'no-store')
  overview(@Req() req: TelegramRequest) { return this.clients.overview(req.telegram.clientId); }
  @Get('client/lessons/:id/reschedule-slots') @Header('Cache-Control', 'no-store')
  rescheduleSlots(@Req() req: TelegramRequest, @Param('id', new ParseUUIDPipe()) id: string, @Query() query: TrainerTmaScheduleQuery) { return this.clients.rescheduleSlots(req.telegram.clientId, id, query); }
  @Post('client/lessons/:id/reschedule')
  reschedule(@Req() req: TelegramRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ClientRescheduleDto) { return this.clients.reschedule(req.telegram.clientId, id, dto); }
  @Post('client/lessons/:id/confirm')
  confirm(@Req() req: TelegramRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.clients.action(req.telegram.clientId, id, 'confirm'); }
  @Post('client/lessons/:id/cancel')
  cancelLesson(@Req() req: TelegramRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.clients.action(req.telegram.clientId, id, 'cancel'); }
  @Get('dashboard') @Header('Cache-Control', 'no-store')
  dashboard(@Req() req: TelegramRequest) { return this.service.dashboard(req.telegram.clientId); }
  @Get('services') @Header('Cache-Control', 'no-store')
  services() { return this.service.services(); }
  @Get(['slots', 'client/booking/slots'])
  slots(@Req() req: TelegramRequest, @Query() query: TmaSlotsQuery) { return this.service.slots(req.telegram.clientId, query); }
  @Post(['bookings', 'client/booking'])
  create(@Req() req: TelegramRequest, @Body() dto: TmaCreateBookingDto) { return this.service.create(req.telegram.clientId, dto); }
  @Get('my-bookings') @Header('Cache-Control', 'no-store')
  bookings(@Req() req: TelegramRequest, @Query() query: TmaBookingsQuery) { return this.service.myBookings(req.telegram.clientId, query); }
  @Post('bookings/:id/cancel-request')
  cancel(@Req() req: TelegramRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.cancelRequest(req.telegram.clientId, id); }
}
