import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class TrainerTmaAuthDto {
  @IsString() @MinLength(1) @MaxLength(16384)
  initData!: string;
}

export class TrainerTmaScheduleQuery {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
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
