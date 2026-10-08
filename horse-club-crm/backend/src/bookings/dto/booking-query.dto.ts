import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { RefineQueryDto } from '../../common/dto/refine-query.dto';

export class BookingRangeDto {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
}
export class BookingAvailabilityDto extends BookingRangeDto {
  @IsOptional() @IsUUID() excludeBookingId?: string;
  @IsOptional() @IsUUID() excludeLessonId?: string;
}
export class ListBookingsDto extends RefineQueryDto {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
  @IsOptional() @IsUUID() trainerId?: string;
  @IsOptional() @IsUUID() horseId?: string;
  @IsOptional() @IsUUID() arenaId?: string;
}
