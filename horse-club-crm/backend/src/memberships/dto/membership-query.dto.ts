import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { ArchiveQueryDto } from '../../common/dto/archive-query.dto';

export class MembershipQueryDto extends ArchiveQueryDto {
  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional() @IsIn(['all', 'active', 'exhausted', 'expired', 'archived']) state?: 'all' | 'active' | 'exhausted' | 'expired' | 'archived';
  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional() @IsIn(['paid', 'debt']) payment?: 'paid' | 'debt';
}
