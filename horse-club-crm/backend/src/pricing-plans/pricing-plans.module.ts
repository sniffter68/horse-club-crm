import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PricingPlansController } from './pricing-plans.controller';
import { PricingPlansService } from './pricing-plans.service';

@Module({ imports: [AuthModule], controllers: [PricingPlansController], providers: [PricingPlansService], exports: [PricingPlansService] })
export class PricingPlansModule {}
