import { Module } from '@nestjs/common';
import { VkDeliveryModule } from '../vk-bot/vk-delivery.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadsController } from './leads.controller';
import { LeadManagementController } from './lead-management.controller';
import { LeadsService } from './leads.service';
import { LessonsModule } from '../lessons/lessons.module';
@Module({ imports: [PrismaModule, AuthModule, VkDeliveryModule, LessonsModule], controllers: [LeadsController, LeadManagementController], providers: [LeadsService], exports: [LeadsService] })
export class LeadsModule {}
