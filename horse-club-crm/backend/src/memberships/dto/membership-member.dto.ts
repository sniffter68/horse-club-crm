import { IsUUID } from 'class-validator';

export class MembershipMemberDto {
  @IsUUID()
  clientId!: string;
}
