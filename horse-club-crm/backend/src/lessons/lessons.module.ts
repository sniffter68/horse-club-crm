import { Module } from '@nestjs/common';
import { VkDeliveryModule } from '../vk-bot/vk-delivery.module';
import { AuthModule } from '../auth/auth.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { HorseWorkloadController } from './horse-workload.controller';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [AuthModule, MembershipsModule, VkDeliveryModule],
  controllers: [LessonsController, HorseWorkloadController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
