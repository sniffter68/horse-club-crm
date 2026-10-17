import { Transform, Type } from 'class-transformer';
import { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

const empty = ({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value;
const trimmed = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateExpenseDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) amount!: number;
  @IsEnum(ExpensePaymentMethod) paymentMethod!: ExpensePaymentMethod;
  @IsEnum(ExpenseCategory) category!: ExpenseCategory;
  @Transform(trimmed) @IsString() @MinLength(1) @MaxLength(500) description!: string;
  @Transform(empty) @IsOptional() @IsDateString() date?: string;
  @Transform(empty) @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048) receiptUrl?: string;
  @IsOptional() @IsUUID() requestId?: string;
}

export class ExpenseQueryDto {
  @Transform(empty) @IsOptional() @IsDateString() from?: string;
  @Transform(empty) @IsOptional() @IsDateString() to?: string;
  @Transform(empty) @IsOptional() @IsEnum(ExpensePaymentMethod) paymentMethod?: ExpensePaymentMethod;
  @Transform(empty) @IsOptional() @IsEnum(ExpenseCategory) category?: ExpenseCategory;
  @Transform(empty) @IsOptional() @IsUUID() shiftId?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
