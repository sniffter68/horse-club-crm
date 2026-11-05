import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { BookingServiceType } from '@prisma/client';
import { CreateBookingDto } from './create-booking.dto';

const emptyToUndefined = ({ value }: { value: unknown }) => value === '' ? undefined : value;

export class UpdateBookingDto extends PartialType(CreateBookingDto, { skipNullProperties: false }) {
  @Transform(emptyToUndefined) declare clientId?: string;
  @Transform(emptyToUndefined) declare trainerId?: string;
  @Transform(emptyToUndefined) declare horseId?: string;
  @Transform(emptyToUndefined) declare arenaId?: string;
  @Transform(emptyToUndefined) declare serviceType?: BookingServiceType;
}
