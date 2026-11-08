import { Module } from '@nestjs/common';
import { BookingsModule } from '../../bookings/bookings.module';
import { LessonsModule } from '../../lessons/lessons.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';
import { TmaBookingService } from './tma-booking.service';

@Module({ imports: [PrismaModule, BookingsModule, LessonsModule], controllers: [TelegramBotController],
  providers: [TelegramBotService, TelegramAuthGuard, TmaBookingService] })
export class TelegramBotModule {}
