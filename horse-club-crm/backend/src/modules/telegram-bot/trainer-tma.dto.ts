import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class TrainerTmaAuthDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(16384)
  initData?: string;
}

export class TrainerTmaScheduleQuery {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class TrainerTmaRescheduleQuery extends TrainerTmaScheduleQuery {
  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional() @IsUUID()
  horseId?: string;

  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional() @IsUUID()
  trainerId?: string;
}

export class ClientRescheduleDto extends TrainerTmaScheduleQuery {
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;
}

export class TrainerTmaRescheduleDto extends TrainerTmaRescheduleQuery {
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}

export class TrainerTmaStatusDto {
  @IsIn(['COMPLETED', 'CANCELLED', 'NO_SHOW'])
  status!: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

  @ValidateIf((dto: TrainerTmaStatusDto) => dto.status !== 'COMPLETED' || dto.reason !== undefined)
  @IsString() @Matches(/\S/) @MaxLength(300)
  reason?: string;
}

export class TrainerTmaHorseDto {
  @IsUUID()
  horseId!: string;

  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional() @IsUUID()
  bookingId?: string;
}
