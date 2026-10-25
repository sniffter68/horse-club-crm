import { IsDefined, IsString, MaxLength, ValidateIf } from 'class-validator';
export class UpdateUserProfileDto {
  @IsDefined() @ValidateIf((_object, value) => value !== null) @IsString() @MaxLength(256)
  vkId!: string | null;
}
