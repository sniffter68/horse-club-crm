import { Module } from '@nestjs/common';
import { StaffController, PayrollController } from './staff.controller';
import { StaffService } from './staff.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [StaffController, PayrollController], providers: [StaffService] })
export class StaffModule {}
