import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelServiceDto {
  @IsBoolean()
  refund!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsIn(['CASH', 'BANK'])
  refundMethod?: 'CASH' | 'BANK';
}
