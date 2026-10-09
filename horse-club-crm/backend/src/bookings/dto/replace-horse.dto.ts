import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReplaceHorseDto {
  @IsUUID()
  horseId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
