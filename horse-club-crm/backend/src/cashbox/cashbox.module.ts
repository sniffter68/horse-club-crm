import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CashboxController } from './cashbox.controller';
import { CashboxService } from './cashbox.service';

@Module({ imports: [AuthModule], controllers: [CashboxController], providers: [CashboxService] })
export class CashboxModule {}
