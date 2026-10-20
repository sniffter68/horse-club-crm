import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { LessonPriceDto } from './lesson-payment.dto';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsISO8601, IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class CreateLessonParticipantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Лошадь участника. Не требуется для теоретического занятия.' })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Абонемент участника.' })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  membershipId?: string;
}

export class CreateLessonDto extends LessonPriceDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  participantsCount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerPerson?: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  trainerId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Лошадь участника. Не требуется для теоретического занятия.' })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Манеж или площадка проведения занятия.' })
  @Transform(({ value }) => value === '' ? undefined : value)
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
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Для обратной совместимости. Используйте participants.',
    deprecated: true,
  })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  membershipId?: string;
}
