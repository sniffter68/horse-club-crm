import { VkIdentityModule } from '../vk-bot/vk-identity.module';
import { Module } from '@nestjs/common';
import { StaffController, PayrollController } from './staff.controller';
import { StaffService } from './staff.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule, VkIdentityModule], controllers: [StaffController, PayrollController], providers: [StaffService] })
export class StaffModule {}
