import { ApiProperty, PartialType } from '@nestjs/swagger';
import { LessonStatus } from '@prisma/client';
import { IsIn } from 'class-validator';
import { CreateLessonDto } from './create-lesson.dto';

export class UpdateLessonDto extends PartialType(CreateLessonDto) {}

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
