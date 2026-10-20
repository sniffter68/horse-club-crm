import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateMembershipDto {
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsUUID()
  pricingPlanId?: string;

  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  pricePerLesson?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  totalPrice!: number;

  @IsIn(['CASH', 'CARD'])
  paymentMethod!: 'CASH' | 'CARD';

  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsUUID()
  requestId?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  totalLessons?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
