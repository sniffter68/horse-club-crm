import { IsOptional, IsUUID } from 'class-validator';
export class UpdateUserTrainerDto {
  @IsOptional() @IsUUID() trainerId!: string | null;
}
