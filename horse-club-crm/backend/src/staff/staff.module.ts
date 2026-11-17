import { VkIdentityModule } from '../vk-bot/vk-identity.module';
import { Module } from '@nestjs/common';
import { StaffController, PayrollController, ShiftsController } from './staff.controller';
import { StaffService } from './staff.service';
import { TrainerPayoutService } from './trainer-payout.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule, VkIdentityModule], controllers: [StaffController, PayrollController, ShiftsController], providers: [StaffService, TrainerPayoutService] })
export class StaffModule {}
