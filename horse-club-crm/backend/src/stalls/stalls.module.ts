import { StableBuildingsController } from '../stable-buildings/stable-buildings.controller';
import { StableBuildingsService } from '../stable-buildings/stable-buildings.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StallsController } from './stalls.controller';
import { StallsService } from './stalls.service';

@Module({
  imports: [AuthModule],
  controllers: [StallsController, StableBuildingsController],
  providers: [StallsService, StableBuildingsService],
  exports: [StallsService],
})
export class StallsModule {}
