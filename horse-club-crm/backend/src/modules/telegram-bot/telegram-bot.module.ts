import { Logger, Module, type OnModuleInit } from '@nestjs/common';
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
import { TelegramScheduleService } from './telegram-schedule.service';
import { ClientTelegramLinkController, UserTelegramLinkController } from './telegram-link.controller';
import { TelegramDeliveryModule } from './telegram-delivery';

@Module({ imports: [PrismaModule, BookingsModule, LessonsModule, AuthModule, TelegramDeliveryModule], controllers: [TelegramBotController, ClientTelegramLinkController, UserTelegramLinkController],
  providers: [TelegramBotService, TelegramAuthGuard, TmaBookingService, TelegramLinkService, TelegramPersonalService, TelegramScheduleService] })
export class TelegramBotModule implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotModule.name);

  onModuleInit(): void {
    this.logger.log('Telegram bot module initialized');
  }
}
