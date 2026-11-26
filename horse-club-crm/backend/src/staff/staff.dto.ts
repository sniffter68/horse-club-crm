import { Transform, Type } from 'class-transformer';
import { TrainerPayScheme, Role, WorkShiftStatus, ExpensePaymentMethod } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { PreserveInput } from '../auth/decorators/preserve-input.decorator';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

const empty = ({ value }: { value: unknown }) => value === '' ? undefined : value;
const emptyNumber = ({ value, obj, key }: { value: unknown; obj: Record<string, unknown>; key: string }) => obj[key] === '' ? undefined : value;
const day = /^\d{4}-\d{2}-\d{2}$/;
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

export class StaffProfileDto {
  @PreserveInput() @IsOptional() @IsBoolean() hasCrmAccess?: boolean;
  @PreserveInput() @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) imageUrl?: string | null;
  @Transform(empty) @IsOptional() @IsEnum(TrainerPayScheme) payScheme?: TrainerPayScheme;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) commissionPercent?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) fixedPay?: number;

  @PreserveInput() @IsOptional() @IsBoolean() allowIndividual?: boolean;
  @PreserveInput() @IsOptional() @IsBoolean() allowGroup?: boolean;
  @PreserveInput() @IsOptional() @IsBoolean() allowWalk?: boolean;
  @PreserveInput() @IsOptional() @IsBoolean() allowSpecial?: boolean;

  @IsOptional() @IsString() @MaxLength(256) vkId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) scheduleColor?: string | null;

  @Transform(empty) @IsOptional() @IsUUID() userId?: string;
  @Transform(empty) @IsOptional() @IsUUID() trainerId?: string;
  @Transform(empty) @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150) position?: string;
  @Transform(empty) @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(256) vkScreenName?: string | null;
  @PreserveInput() @IsOptional() @IsBoolean() createCrmAccess?: boolean;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72) temporaryPassword?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(150) fullName!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsOptional() @IsString() @MinLength(1) @MaxLength(150) roleTitle?: string;
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
export class PlannedShiftDayDto {
  @Matches(day) date!: string;
  @IsIn(['WORK', 'OFF', 'VACATION']) kind!: 'WORK' | 'OFF' | 'VACATION';
  @Matches(clock) startTime!: string;
  @Matches(clock) endTime!: string;
}
export class CreateShiftDto {
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => PlannedShiftDayDto) days?: PlannedShiftDayDto[];
  @PreserveInput() @IsOptional() @IsBoolean() force?: boolean;
  @IsUUID() staffId!: string;
  @IsOptional() @Matches(day) date?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(31) @ArrayUnique() @Matches(day, { each: true }) dates?: string[];
  @ValidateIf((dto: CreateShiftDto) => !dto.days) @Matches(clock) startTime!: string;
  @ValidateIf((dto: CreateShiftDto) => !dto.days) @Matches(clock) endTime!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateShiftDto {
  @PreserveInput() @IsOptional() @IsBoolean() force?: boolean;
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

export class StaffQueryDto extends ShiftQueryDto {
  @Transform(empty) @IsOptional() @IsEnum(Role) role?: Role;
  @Transform(empty) @IsOptional() @IsIn(['stable']) group?: 'stable';
  @Transform(empty) @IsOptional() @IsIn(['active', 'archived']) activity?: 'active' | 'archived';
  @Transform(empty) @IsOptional() @IsIn(['on', 'off']) duty?: 'on' | 'off';
}
export class DutyDto {
  @Transform(empty) @IsOptional() @IsUUID() staffId?: string;
}
