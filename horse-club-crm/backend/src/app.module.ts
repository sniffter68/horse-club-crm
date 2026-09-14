import { Module } from '@nestjs/common';
import { LeadsModule } from './leads/leads.module';
import { VkBotModule } from './vk-bot/vk-bot.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { HorseHealthLogsModule } from './horse-health-logs/horse-health-logs.module';
import { HorsesModule } from './horses/horses.module';
import { LessonsModule } from './lessons/lessons.module';
import { MembershipsModule } from './memberships/memberships.module';
import { PrismaModule } from './prisma/prisma.module';
import { PricingPlansModule } from './pricing-plans/pricing-plans.module';
import { ArenasModule } from './arenas/arenas.module';
import { BoardingContractsModule } from './boarding-contracts/boarding-contracts.module';
import { ServicesModule } from './services/services.module';
import { SettingsModule } from './settings/settings.module';
import { StallsModule } from './stalls/stalls.module';
import { TrainersModule } from './trainers/trainers.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    LeadsModule,
    VkBotModule,
    PrismaModule,
    CommonModule,
    HealthModule,
    HorseHealthLogsModule,
    AuthModule,
    LessonsModule,
    MembershipsModule,
    PricingPlansModule,
    ArenasModule,
    BoardingContractsModule,
    StallsModule,
    SettingsModule,
    ClientsModule,
    HorsesModule,
    TrainersModule,
    ServicesModule,
    UsersModule,
  ],
})
export class AppModule {}
