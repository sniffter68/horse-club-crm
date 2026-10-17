import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BoardingServicesController, VetCalendarController } from './boarding.controller';
import { BoardingBillingService, BoardingServicesService } from './boarding.service';
import { VetCalendarService } from './vet-calendar.service';
import { VetRecordService } from './vet-record.service';
import { VetRecordController } from './vet-record.controller';

@Module({ imports: [AuthModule], controllers: [BoardingServicesController, VetCalendarController, VetRecordController], providers: [BoardingBillingService, BoardingServicesService, VetCalendarService, VetRecordService] })
export class BoardingModule {}
