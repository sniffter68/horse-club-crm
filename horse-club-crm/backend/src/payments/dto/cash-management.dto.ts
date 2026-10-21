import { IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ResetCashDto {
  @IsIn(['RESET_CASH']) confirmation!: 'RESET_CASH';
  @IsOptional() @IsUUID() requestId?: string;
}

export class WithdrawCashDto {
  @IsUUID() requestId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) amount!: number;
}
