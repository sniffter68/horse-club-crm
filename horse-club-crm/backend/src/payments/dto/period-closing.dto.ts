import { IsIn, IsOptional, Matches } from 'class-validator';

export class PeriodClosingDto {
  @IsIn(['SHIFT', 'MONTH'])
  type!: 'SHIFT' | 'MONTH';
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}
