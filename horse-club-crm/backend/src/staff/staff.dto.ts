import { Transform, Type } from 'class-transformer';
import { WorkShiftStatus, ExpensePaymentMethod } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { PreserveInput } from '../auth/decorators/preserve-input.decorator';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const empty = ({ value }: { value: unknown }) => value === '' ? undefined : value;
const emptyNumber = ({ value, obj, key }: { value: unknown; obj: Record<string, unknown>; key: string }) => obj[key] === '' ? undefined : value;
const day = /^\d{4}-\d{2}-\d{2}$/;
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

export class StaffProfileDto {
  @IsUUID() userId!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(150) fullName!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(150) roleTitle!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) shiftRate?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) lessonRate?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) groupLessonRate?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) lessonPercentage?: number | null;
  @PreserveInput() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateStaffProfileDto extends PartialType(StaffProfileDto) {}

export class ShiftQueryDto {
  @Transform(empty) @IsOptional() @IsUUID() staffId?: string;
  @Transform(empty) @IsOptional() @Matches(day) from?: string;
  @Transform(empty) @IsOptional() @Matches(day) to?: string;
  @Transform(empty) @IsOptional() @IsEnum(WorkShiftStatus) status?: WorkShiftStatus;
  @Transform(emptyNumber) @Type(() => Number) @IsOptional() @IsInt() @Min(1) page?: number;
  @Transform(emptyNumber) @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
export class PayrollQueryDto extends ShiftQueryDto {
  @Matches(day) declare from: string;
  @Matches(day) declare to: string;
}
export class CreateShiftDto {
  @IsUUID() staffId!: string;
  @IsOptional() @Matches(day) date?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(31) @ArrayUnique() @Matches(day, { each: true }) dates?: string[];
  @Matches(clock) startTime!: string;
  @Matches(clock) endTime!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateShiftDto {
  @IsOptional() @IsEnum(WorkShiftStatus) status?: WorkShiftStatus;
  @IsOptional() @Matches(clock) startTime?: string;
  @IsOptional() @Matches(clock) endTime?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class SavePayrollDto {
  @IsOptional() @IsDateString() expectedUpdatedAt?: string | null;
  @IsUUID() staffId!: string;
  @Matches(day) from!: string;
  @Matches(day) to!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) bonuses!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) penalties!: number;
}
export class PayoutDto {
  @IsUUID() calculationId!: string;
  @IsEnum(ExpensePaymentMethod) paymentMethod!: ExpensePaymentMethod;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) expectedTotal!: number;
}
