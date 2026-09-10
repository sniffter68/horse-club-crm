import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class HorseWorkloadQueryDto {
  @ApiProperty({ example: '2026-09-07', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must have format YYYY-MM-DD',
  })
  date!: string;
}
