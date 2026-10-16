import { IsDefined, IsUUID, ValidateIf } from 'class-validator';
export class AssignStallDto {
  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  horseId!: string | null;
}
