import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { TrainerPayoutType } from '@prisma/client';

export class TrainerStatementQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}
export class GenerateTrainerStatementDto extends TrainerStatementQueryDto {
  @IsEnum(TrainerPayoutType)
  type!: TrainerPayoutType;

  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodStart?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodEnd?: string;
}
