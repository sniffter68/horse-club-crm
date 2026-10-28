import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class MonthlyClosingDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(9998)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

export class ConfirmMonthlyClosingDto extends MonthlyClosingDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
