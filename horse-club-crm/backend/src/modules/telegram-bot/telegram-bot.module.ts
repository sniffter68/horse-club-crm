import { Module } from '@nestjs/common';
import { BookingsModule } from '../../bookings/bookings.module';
import { LessonsModule } from '../../lessons/lessons.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';
import { TmaBookingService } from './tma-booking.service';
import { AuthModule } from '../../auth/auth.module';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramPersonalService } from './telegram-personal.service';
import { ClientTelegramLinkController, UserTelegramLinkController } from './telegram-link.controller';
import { TelegramDeliveryModule } from './telegram-delivery';

@Module({ imports: [PrismaModule, BookingsModule, LessonsModule, AuthModule, TelegramDeliveryModule], controllers: [TelegramBotController, ClientTelegramLinkController, UserTelegramLinkController],
  providers: [TelegramBotService, TelegramAuthGuard, TmaBookingService, TelegramLinkService, TelegramPersonalService] })
export class TelegramBotModule {}
