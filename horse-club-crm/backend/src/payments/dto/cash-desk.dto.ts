import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CashDeskPaymentDto {
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() requestId?: string;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsOptional() @IsUUID() membershipId?: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsString() @MaxLength(150) serviceType?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) amount!: number;
  @IsIn(['CASH', 'CARD_TERMINAL', 'SBP', 'TRANSFER']) method!: 'CASH' | 'CARD_TERMINAL' | 'SBP' | 'TRANSFER';
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) cashGiven?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class CashSummaryQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsUUID() cashierId?: string;
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class OpenCashShiftDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) startingCash = 0;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
