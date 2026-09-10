import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VkBotController } from './vk-bot.controller';
import { VkBotService } from './vk-bot.service';
import { MembershipsModule } from '../memberships/memberships.module';
import { LeadsModule } from '../leads/leads.module';
import { VkLinkService } from './vk-link.service';
import { VkLinkController } from './vk-link.controller';
import { VkDeliveryModule } from './vk-delivery.module';
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [PrismaModule, AuthModule, MembershipsModule, LeadsModule, VkDeliveryModule], controllers: [VkBotController, VkLinkController], providers: [VkBotService, VkLinkService] })
export class VkBotModule {}
