import { MonthlyClosingService } from './monthly-closing.service';
import { CashDeskService } from './cash-desk.service';
import { CashController } from './cash.controller';
import { CashManagementService } from './cash-management.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ imports: [AuthModule], controllers: [PaymentsController, FinanceController, CashController], providers: [MonthlyClosingService, PaymentsService, CashDeskService, FinanceService, CashManagementService], exports: [PaymentsService] })
export class PaymentsModule {}
