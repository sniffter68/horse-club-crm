import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, Min, IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

import { StallZone, StallSide, StallStatus, StallType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';

export class CreateStallDto {
  @ApiPropertyOptional({ enum: StallType }) @Transform(({ value }) => value === '' ? undefined : value) @ValidateIf((_object, value) => value !== undefined) @IsEnum(StallType) type?: StallType;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) @MaxLength(30) number?: string;
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
