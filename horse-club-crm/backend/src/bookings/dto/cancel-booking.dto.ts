import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';

export class CancelBookingDto {
  @IsIn(['client', 'club']) cancelledBy!: 'client' | 'club';
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 1000) reason!: string;
}
