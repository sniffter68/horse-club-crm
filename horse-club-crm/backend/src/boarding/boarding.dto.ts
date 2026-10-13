import { Transform, Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { VetEventStatus, VetEventType } from '@prisma/client';

export class BoardingQueryDto {
  @IsOptional() @IsUUID() horseId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class CreateBoardingLogDto {
  @IsUUID() horseId!: string;
  @IsUUID() requestId!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(100) serviceType!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) cost!: number;
  @IsOptional() @IsISO8601() performedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class VetQueryDto extends BoardingQueryDto {
  @IsOptional() @IsEnum(VetEventType) type?: VetEventType;
}
export class CreateVetEventDto {
  @IsUUID() horseId!: string;
  @IsEnum(VetEventType) type!: VetEventType;
  @IsISO8601() eventDate!: string;
  @IsOptional() @IsISO8601() nextDueDate?: string;
  @IsOptional() @IsString() @MaxLength(200) performedBy?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsEnum(VetEventStatus) status: VetEventStatus = 'scheduled';
}
export class CompleteVetEventDto {
  @IsOptional() @IsISO8601() nextDueDate?: string;
  @IsOptional() @IsString() @MaxLength(200) performedBy?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
