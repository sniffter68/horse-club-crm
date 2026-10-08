import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingServiceType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty() @IsUUID() clientId!: string;
  @ApiProperty() @IsUUID() trainerId!: string;
  @ApiProperty() @IsUUID() horseId!: string;
  @ApiProperty() @IsUUID() arenaId!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString({ strict: true }) startTime!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString({ strict: true }) endTime!: string;
  @ApiProperty({ enum: BookingServiceType }) @IsEnum(BookingServiceType) serviceType!: BookingServiceType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() membershipId?: string;
  @ApiProperty({ minimum: 0, maximum: 999999999999.99 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999.99) costAmount!: number;
}
