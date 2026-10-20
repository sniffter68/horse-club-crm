import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class LessonPriceDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  cost?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  prepaymentAmount?: number;

  @ApiPropertyOptional({ enum: ['CASH', 'CARD'] })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsIn(['CASH', 'CARD'])
  prepaymentMethod?: PaymentMethod;
}

export class CompleteLessonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  payRemaining?: boolean;

  @ApiPropertyOptional({ enum: ['CASH', 'CARD'] })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsIn(['CASH', 'CARD'])
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  customAmount?: number;
}
