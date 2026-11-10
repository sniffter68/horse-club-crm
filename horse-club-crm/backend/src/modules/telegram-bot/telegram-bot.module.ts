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
import { JwtModule } from '@nestjs/jwt';
import { AuthConfigModule } from '../../auth/auth-config.module';
import { AUTH_OPTIONS, type AuthOptions } from '../../auth/auth.config';
import { TrainerTmaService } from './trainer-tma.service';
import { TrainerTmaAuthController, TrainerTmaController, TrainerTmaGuard } from './trainer-tma.controller';

@Module({ imports: [PrismaModule, BookingsModule, LessonsModule, AuthModule, TelegramDeliveryModule,
  JwtModule.registerAsync({ imports: [AuthConfigModule], inject: [AUTH_OPTIONS],
    useFactory: (options: AuthOptions) => ({ secret: options.secret, signOptions: { algorithm: 'HS256' as const } }) })],
  controllers: [TelegramBotController, ClientTelegramLinkController, UserTelegramLinkController, TrainerTmaAuthController, TrainerTmaController],
  providers: [TelegramBotService, TelegramAuthGuard, TmaBookingService, TelegramLinkService, TelegramPersonalService, TelegramScheduleService, TrainerTmaService, TrainerTmaGuard] })
export class TelegramBotModule implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotModule.name);

  onModuleInit(): void {
    this.logger.log('Telegram bot module initialized');
  }
}
