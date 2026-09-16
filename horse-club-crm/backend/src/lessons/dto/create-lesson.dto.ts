import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsISO8601, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';

export class CreateLessonParticipantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Лошадь участника. Не требуется для теоретического занятия.' })
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Абонемент участника.' })
  @IsOptional()
  @IsUUID()
  membershipId?: string;
}

export class CreateLessonDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  trainerId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Лошадь участника. Не требуется для теоретического занятия.' })
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Манеж или площадка проведения занятия.' })
  @IsOptional()
  @IsUUID()
  arenaId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  @ApiPropertyOptional({ type: [CreateLessonParticipantDto], description: 'Участники индивидуального или группового занятия.' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateLessonParticipantDto)
  participants?: CreateLessonParticipantDto[];

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

  @ApiPropertyOptional({ format: 'uuid', deprecated: true, description: 'Для обратной совместимости. Используйте participants.' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Для обратной совместимости. Используйте participants.',
    deprecated: true,
  })
  @IsOptional()
  @IsUUID()
  membershipId?: string;
}
