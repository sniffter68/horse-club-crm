import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateClientVkDto {
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(200)
  vkId!: string | null;
}
