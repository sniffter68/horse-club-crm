import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { ClientType } from '@prisma/client';
import { ArchiveQueryDto } from '../../common/dto/archive-query.dto';

export class ClientQueryDto extends ArchiveQueryDto {
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;
}
