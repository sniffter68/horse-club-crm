import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const HH_MM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class UpdateClubScheduleDto {
  @ApiPropertyOptional({ example: '09:00', pattern: HH_MM.source })
  @IsOptional()
  @Matches(HH_MM)
  openTime?: string;

  @ApiPropertyOptional({ example: '21:00', pattern: HH_MM.source })
  @IsOptional()
  @Matches(HH_MM)
  closeTime?: string;

  @ApiPropertyOptional({ example: [0, 6], type: [Number], description: 'Дни недели: 0 — воскресенье, 6 — суббота.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeekOff?: number[];
}
