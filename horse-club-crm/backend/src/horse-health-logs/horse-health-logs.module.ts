import { Module } from '@nestjs/common';
import { HorseHealthLogsController } from './horse-health-logs.controller';
import { HorseHealthLogsService } from './horse-health-logs.service';

@Module({
  controllers: [HorseHealthLogsController],
  providers: [HorseHealthLogsService],
})
export class HorseHealthLogsModule {}
