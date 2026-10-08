import { ApiProperty, PartialType } from '@nestjs/swagger';
import { LessonStatus } from '@prisma/client';
import { IsIn, IsISO8601, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLessonDto } from './create-lesson.dto';

export class UpdateLessonDto extends PartialType(CreateLessonDto) {}

export class RescheduleLessonDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  startTime!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes!: number;
}

const FINAL_LESSON_STATUSES = [
  LessonStatus.COMPLETED,
  LessonStatus.NO_SHOW,
  LessonStatus.CANCELLED,
] as const;

export class UpdateLessonStatusDto {
  @ApiProperty({ enum: FINAL_LESSON_STATUSES })
  @IsIn(FINAL_LESSON_STATUSES)
  status!: LessonStatus;
}
