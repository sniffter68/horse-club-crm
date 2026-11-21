import { ClientsModule } from '../../clients/clients.module';
import { QuickTrainerBookingService } from './quick-trainer-booking.service';
import { QuickTrainerBookingController, QuickTrainerBookingTmaController } from './trainer-tma.controller';
import { ClientMiniappService } from './client-miniapp.service';
import { MembershipsModule } from '../../memberships/memberships.module';
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
import { BotScheduleModule } from '../../common/bot-schedule/bot-schedule.module';
import { ClientTelegramLinkController, UserTelegramLinkController } from './telegram-link.controller';
import { TelegramDeliveryModule } from './telegram-delivery';
import { JwtModule } from '@nestjs/jwt';
import { AuthConfigModule } from '../../auth/auth-config.module';
import { AUTH_OPTIONS, type AuthOptions } from '../../auth/auth.config';
import { TrainerTmaService } from './trainer-tma.service';
import { WorkspaceModule } from '../../workspace/workspace.module';
import { TrainerBoardTmaController, TrainerTmaAuthController, TrainerTmaController, TrainerTmaGuard } from './trainer-tma.controller';

@Module({ imports: [ClientsModule, MembershipsModule, BotScheduleModule, WorkspaceModule, PrismaModule, BookingsModule, LessonsModule, AuthModule, TelegramDeliveryModule,
  JwtModule.registerAsync({ imports: [AuthConfigModule], inject: [AUTH_OPTIONS],
    useFactory: (options: AuthOptions) => ({ secret: options.secret, signOptions: { algorithm: 'HS256' as const } }) })],
  controllers: [QuickTrainerBookingController, QuickTrainerBookingTmaController, TrainerBoardTmaController, TelegramBotController, ClientTelegramLinkController, UserTelegramLinkController, TrainerTmaAuthController, TrainerTmaController],
  providers: [QuickTrainerBookingService, ClientMiniappService, TelegramBotService, TelegramAuthGuard, TmaBookingService, TelegramLinkService, TelegramPersonalService, TrainerTmaService, TrainerTmaGuard] })
export class TelegramBotModule implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotModule.name);

  onModuleInit(): void {
    this.logger.log('Telegram bot module initialized');
  }
}
