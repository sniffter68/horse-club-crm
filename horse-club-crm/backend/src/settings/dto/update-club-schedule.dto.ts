import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

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

  @ApiPropertyOptional({ example: 1, minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeekOff?: number;
}
