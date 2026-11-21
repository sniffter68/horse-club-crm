import { IsISO8601, IsUUID } from 'class-validator';

export class BookingMembershipsQueryDto {
  @IsUUID()
  serviceId!: string;

  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;
}
