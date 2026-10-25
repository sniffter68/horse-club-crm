import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VkBotController } from './vk-bot.controller';
import { VkBotService } from './vk-bot.service';
import { MembershipsModule } from '../memberships/memberships.module';
import { LeadsModule } from '../leads/leads.module';
import { VkLinkService } from './vk-link.service';
import { VkIdentityController } from './vk-identity.controller';
import { VkIdentityModule } from './vk-identity.module';
import { VkDeliveryModule } from './vk-delivery.module';
import { VkRemindersModule } from './vk-reminders.module';
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [VkIdentityModule, PrismaModule, AuthModule, MembershipsModule, LeadsModule, VkDeliveryModule, VkRemindersModule], controllers: [VkBotController, VkIdentityController], providers: [VkBotService, VkLinkService] })
export class VkBotModule {}
