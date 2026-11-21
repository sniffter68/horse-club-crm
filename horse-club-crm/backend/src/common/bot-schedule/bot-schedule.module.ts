import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RoleAccessModule } from '../../auth/role-access.module';
import { TrainerScheduleBotService } from './trainer-schedule-bot.service';

@Module({ imports: [PrismaModule, RoleAccessModule], providers: [TrainerScheduleBotService], exports: [TrainerScheduleBotService] })
export class BotScheduleModule {}
