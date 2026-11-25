import { Transform } from 'class-transformer';
import { BookingServiceType } from '@prisma/client';
import { IsIn, IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { RefineQueryDto } from '../../common/dto/refine-query.dto';

export class BookingRangeDto {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
}
export class HorseIssuesQueryDto extends RefineQueryDto {
  @IsOptional() @IsUUID() horseId?: string;
}
export class BookingAvailabilityDto extends BookingRangeDto {
  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional() @IsUUID() serviceId?: string;
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional() @IsIn(['allowIndividual', 'allowGroup', 'allowWalk', 'allowSpecial'])
  serviceDirection?: 'allowIndividual' | 'allowGroup' | 'allowWalk' | 'allowSpecial';
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional() @IsEnum(BookingServiceType) serviceType?: BookingServiceType;
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional() @IsUUID() excludeBookingId?: string;
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional() @IsUUID() excludeLessonId?: string;
}
export class ListBookingsDto extends RefineQueryDto {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
  @IsOptional() @IsUUID() trainerId?: string;
  @IsOptional() @IsUUID() horseId?: string;
  @IsOptional() @IsUUID() arenaId?: string;
}
