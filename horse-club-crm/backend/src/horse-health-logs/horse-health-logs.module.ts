import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HorseHealthLogsController } from './horse-health-logs.controller';
import { HorseHealthLogsService } from './horse-health-logs.service';

@Module({
  imports: [AuthModule],
  controllers: [HorseHealthLogsController],
  providers: [HorseHealthLogsService],
})
export class HorseHealthLogsModule {}
