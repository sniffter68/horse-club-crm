import { Transform } from 'class-transformer';
import { IsBoolean, IsUUID, ValidateIf } from 'class-validator';

export class TransferStallDto {
  @IsUUID() sourceStallId!: string;
  @IsUUID() targetStallId!: string;
  @IsUUID() horseId!: string;
  @IsBoolean() swapIfOccupied!: boolean;
  @Transform(({ value }) => value === '' ? undefined : value)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUUID() expectedTargetHorseId?: string | null;
}
