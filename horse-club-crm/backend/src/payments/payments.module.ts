import { CashDeskService } from './cash-desk.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ imports: [AuthModule], controllers: [PaymentsController, FinanceController], providers: [PaymentsService, CashDeskService, FinanceService], exports: [PaymentsService] })
export class PaymentsModule {}
