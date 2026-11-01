import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class PayWithMembershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  membershipId!: string;
}
