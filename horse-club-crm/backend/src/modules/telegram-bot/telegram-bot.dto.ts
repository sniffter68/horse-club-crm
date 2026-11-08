import { Transform, Type } from 'class-transformer';
import { Equals, IsBoolean, IsInt, IsISO8601, IsOptional, IsPhoneNumber, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export class TmaSlotsQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional() @IsUUID() serviceId?: string;
}
export class TmaBookingsQuery {
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() offset = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) @IsOptional() limit = 20;
}
export class TmaCreateBookingDto {
  @IsUUID() serviceId!: string;
  @IsUUID() trainerId!: string;
  @IsISO8601({ strict: true }) startTime!: string;
  @IsUUID() requestId!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value)
  @IsPhoneNumber('RU') phone!: string;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.consentAccepted)
  @IsBoolean() @Equals(true) consentAccepted!: boolean;
  @IsString() @Matches(/^[a-zA-Z0-9._-]{1,64}$/) consentVersion!: string;
}
