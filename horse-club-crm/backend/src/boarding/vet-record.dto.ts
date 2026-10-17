import { Transform, Type } from 'class-transformer';
import { IsArray, ArrayMinSize, ArrayMaxSize, ArrayUnique, IsEnum, IsISO8601, IsInt, IsNumber, IsOptional, IsString, IsUUID, IsUrl, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { HorseHealthStatus, VetRecordType } from '@prisma/client';

const empty = ({ value }: { value: unknown }) => value === '' ? undefined : value;
export class VetRecordQueryDto {
  @Transform(empty) @IsOptional() @IsUUID() horseId?: string;
  @Transform(empty) @IsOptional() @IsEnum(VetRecordType) type?: VetRecordType;
  @Transform(empty) @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @Transform(empty) @IsOptional() @IsISO8601({ strict: true }) to?: string;
  @Transform(({ obj, key, value }) => obj[key] === '' ? undefined : value) @Type(() => Number) @IsOptional() @IsInt() @Min(0) offset = 0;
  @Transform(({ obj, key, value }) => obj[key] === '' ? undefined : value) @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
}
export class CreateVetRecordDto {
  @IsUUID() horseId!: string;
  @IsEnum(VetRecordType) type!: VetRecordType;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(250) title!: string;
  @IsISO8601({ strict: true }) performedAt!: string;
  @IsOptional() @IsISO8601({ strict: true }) nextDueDate?: string | null;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(200) specialist!: string;
  @IsOptional() @IsString() @MaxLength(1000) medication?: string | null;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) cost?: number | null;
  @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false }) @MaxLength(2000) documentUrl?: string | null;
}
export class UpdateVetRecordDto extends PartialType(CreateVetRecordDto) {}
export class BatchVetRecordDto extends CreateVetRecordDto {
  @ValidateIf(() => false) declare horseId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID('all', { each: true }) horseIds!: string[];
}
export class HorseHealthDto {
  @IsEnum(HorseHealthStatus) healthStatus!: HorseHealthStatus;
  @IsOptional() @IsISO8601({ strict: true }) quarantineUntil?: string | null;
}
