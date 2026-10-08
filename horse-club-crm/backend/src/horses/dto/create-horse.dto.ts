import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { HorseStatus } from '@prisma/client';

export class CreateHorseDto {
  @ApiPropertyOptional({ enum: HorseStatus }) @IsOptional() @IsEnum(HorseStatus) status?: HorseStatus;
  @ApiPropertyOptional({ default: 85 }) @IsOptional() @IsInt() @Min(1) @Max(1000) maxRiderWeight?: number;
  @ApiPropertyOptional({ default: 120 }) @IsOptional() @IsInt() @Min(1) @Max(1440) maxDailyWorkloadMinutes?: number;
  @ApiPropertyOptional({ default: 45 }) @IsOptional() @IsInt() @Min(0) @Max(1440) requiredRestMinutes?: number;
  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedingNotes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  breed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  riderLevel?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isUnavailable?: boolean;
  @ApiProperty({ example: 'Буран' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ default: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  maxDailyMinutes?: number;

  @ApiPropertyOptional({ default: 45 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  minRestMinutes?: number;
}
