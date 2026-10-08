import { IsDateString } from 'class-validator';

export class BoardingAvailabilityQueryDto {
  @IsDateString()
  startsAt!: string;
}
