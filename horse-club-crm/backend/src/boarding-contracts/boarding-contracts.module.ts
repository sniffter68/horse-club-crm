import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardingContractsController } from './boarding-contracts.controller';
import { BoardingContractsService } from './boarding-contracts.service';

@Module({
  imports: [AuthModule],
  controllers: [BoardingContractsController],
  providers: [BoardingContractsService],
  exports: [BoardingContractsService],
})
export class BoardingContractsModule {}
