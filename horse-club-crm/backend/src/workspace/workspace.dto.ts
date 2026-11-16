import { IsIn, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class TrainerBoardQuery {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class TrainerStatusDto {
  @IsIn(['COMPLETED', 'NO_SHOW'])
  status!: 'COMPLETED' | 'NO_SHOW';

  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(1000)
  trainerNote?: string;
}
