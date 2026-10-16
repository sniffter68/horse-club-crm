import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, Min, IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

import { StallZone, StallSide, StallStatus } from '@prisma/client';

export class CreateStallDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) @MaxLength(30) number?: string;
  @ApiPropertyOptional({ enum: StallZone }) @ValidateIf((_object, value) => value !== undefined) @IsEnum(StallZone) zone?: StallZone;
  @ApiPropertyOptional({ enum: StallSide }) @ValidateIf((_object, value) => value !== undefined) @IsEnum(StallSide) side?: StallSide;
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1) position?: number;
  @ApiPropertyOptional({ enum: StallStatus }) @ValidateIf((_object, value) => value !== undefined) @IsEnum(StallStatus) status?: StallStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) notes?: string;

  @ApiPropertyOptional({ example: 'Денник 1' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

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
