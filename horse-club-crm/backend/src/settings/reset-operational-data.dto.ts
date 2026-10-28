import { Equals, IsOptional, IsUUID } from 'class-validator';

export class ResetOperationalDataDto {
  @Equals('RESET_ALL_OPERATIONAL_DATA')
  confirmation!: string;

  // Reuse on transport retries so newly entered data cannot be erased twice.
  @IsOptional()
  @IsUUID('4')
  requestId?: string;
}
