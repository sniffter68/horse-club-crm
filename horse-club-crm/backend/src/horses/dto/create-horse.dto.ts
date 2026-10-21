import { Transform } from 'class-transformer';
import { PublicationDto } from '../../common/dto/publication.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsUUID, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { HorseOwnerType, HorseSex, HorseStatus } from '@prisma/client';

export class CreateHorseDto extends PublicationDto {
  @IsOptional() @IsString() @MaxLength(150) coat?: string | null;
  @Transform(({ value }) => value === '' ? undefined : value) @IsOptional() @IsEnum(HorseOwnerType) ownerType?: HorseOwnerType;
  @Transform(({ value }) => value === '' ? undefined : value) @IsOptional() @IsUUID() ownerId?: string | null;

  @Transform(({ value }) => value === '' ? undefined : value)
  @ApiPropertyOptional({ enum: HorseSex, nullable: true }) @IsOptional() @IsEnum(HorseSex) sex?: HorseSex | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1900) @Max(2100) birthYear?: number | null;
  @Transform(({ value }) => value === '' ? undefined : value)
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
