import { IsUUID } from 'class-validator';

export class ChangeTrainerDto {
  @IsUUID()
  trainerId!: string;
}
