import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StallsController } from './stalls.controller';
import { StallsService } from './stalls.service';

@Module({
  imports: [AuthModule],
  controllers: [StallsController],
  providers: [StallsService],
  exports: [StallsService],
})
export class StallsModule {}
