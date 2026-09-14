import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HealthLogType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateHorseHealthLogDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  horseId!: string;

  @ApiProperty({ enum: HealthLogType })
  @IsEnum(HealthLogType)
  type!: HealthLogType;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  nextDueAt?: string | null;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
