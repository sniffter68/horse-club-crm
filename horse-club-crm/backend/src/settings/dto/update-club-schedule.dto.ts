import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsInt, ValidateIf, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const HH_MM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class ClubWeekDayDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean()
  isWorkingDay!: boolean;

  @Matches(HH_MM)
  openTime!: string;

  @Matches(HH_MM)
  closeTime!: string;
}

export class UpdateClubScheduleDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => ClubWeekDayDto)
  weekDays?: ClubWeekDayDto[];
  @ApiPropertyOptional({ example: '09:00', pattern: HH_MM.source })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Matches(HH_MM)
  openTime?: string;

  @ApiPropertyOptional({ example: '21:00', pattern: HH_MM.source })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Matches(HH_MM)
  closeTime?: string;

  @ApiPropertyOptional({ example: [0, 6], type: [Number], description: 'Дни недели: 0 — воскресенье, 6 — суббота.' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeekOff?: number[];
}
