import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { HorseWorkloadController } from './horse-workload.controller';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [AuthModule, MembershipsModule],
  controllers: [LessonsController, HorseWorkloadController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
