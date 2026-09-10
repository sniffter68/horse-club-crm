import { Module } from '@nestjs/common';
import { LeadsModule } from './leads/leads.module';
import { VkBotModule } from './vk-bot/vk-bot.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { HorsesModule } from './horses/horses.module';
import { LessonsModule } from './lessons/lessons.module';
import { MembershipsModule } from './memberships/memberships.module';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { SettingsModule } from './settings/settings.module';
import { TrainersModule } from './trainers/trainers.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    LeadsModule,
    VkBotModule,
    PrismaModule,
    CommonModule,
    HealthModule,
    AuthModule,
    LessonsModule,
    MembershipsModule,
    SettingsModule,
    ClientsModule,
    HorsesModule,
    TrainersModule,
    ServicesModule,
    UsersModule,
  ],
})
export class AppModule {}
