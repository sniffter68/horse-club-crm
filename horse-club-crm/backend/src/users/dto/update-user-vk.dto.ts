import { IsDefined, Matches, ValidateIf } from 'class-validator';

export class UpdateUserVkDto {
  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @Matches(/^[1-9]\d{0,14}$/)
  vkUserId!: string | null;
}
