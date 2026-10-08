import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingRulesService } from './booking-rules.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({ imports: [AuthModule], providers: [BookingRulesService, BookingsService], controllers: [BookingsController], exports: [BookingRulesService, BookingsService] })
export class BookingsModule {}
