import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembershipLedgerService } from './membership-ledger.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [AuthModule],
  controllers: [MembershipsController],
  providers: [MembershipLedgerService, MembershipsService],
  exports: [MembershipLedgerService],
})
export class MembershipsModule {}
