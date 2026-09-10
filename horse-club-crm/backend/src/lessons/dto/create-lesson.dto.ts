import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateLessonDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  trainerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  horseId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  startTime!: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    description: 'Продолжительность в минутах. По умолчанию берётся из услуги.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Абонемент первого участника. Требует clientId.',
  })
  @IsOptional()
  @IsUUID()
  membershipId?: string;
}
