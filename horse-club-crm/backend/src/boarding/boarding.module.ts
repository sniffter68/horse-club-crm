import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardingServicesController, VetCalendarController } from './boarding.controller';
import { BoardingBillingService, BoardingServicesService } from './boarding.service';
import { VetCalendarService } from './vet-calendar.service';

@Module({ imports: [AuthModule], controllers: [BoardingServicesController, VetCalendarController], providers: [BoardingBillingService, BoardingServicesService, VetCalendarService] })
export class BoardingModule {}
