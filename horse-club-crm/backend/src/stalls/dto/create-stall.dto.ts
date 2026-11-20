import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsEnum, IsInt, Min, IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { StallZone, StallSide, StallStatus, StallType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';

export class CreateStallDto {
  @Transform(({ value }) => value === '' || value === null ? undefined : value) @ValidateIf((_object, value) => value !== undefined) @IsUUID() buildingId?: string;
  @Type(() => Number) @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1) row?: number;
  @Type(() => Number) @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1) col?: number;
  @Type(() => Number) @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1) rowSpan?: number;
  @Type(() => Number) @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1) colSpan?: number;
  @ApiPropertyOptional({ enum: StallType }) @Transform(({ value }) => value === '' ? undefined : value) @ValidateIf((_object, value) => value !== undefined) @IsEnum(StallType) type?: StallType;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(30) number?: string;
  @ApiPropertyOptional({ enum: StallZone }) @Transform(({ value }) => value === '' ? undefined : value) @ValidateIf((_object, value) => value !== undefined) @IsEnum(StallZone) zone?: StallZone;
  @ApiPropertyOptional({ enum: StallSide }) @Transform(({ value }) => value === '' ? undefined : value) @ValidateIf((_object, value) => value !== undefined) @IsEnum(StallSide) side?: StallSide;
  @ApiPropertyOptional() @Type(() => Number) @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1) position?: number;
  @ApiPropertyOptional({ enum: StallStatus }) @Transform(({ value }) => value === '' ? undefined : value) @ValidateIf((_object, value) => value !== undefined) @IsEnum(StallStatus) status?: StallStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) notes?: string;

  @ApiPropertyOptional({ example: 'Денник 1' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isUnavailable?: boolean;
}
