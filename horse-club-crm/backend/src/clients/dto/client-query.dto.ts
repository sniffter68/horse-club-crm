import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { ClientType } from '@prisma/client';
import { RefineQueryDto } from '../../common/dto/refine-query.dto';

export class ClientQueryDto extends RefineQueryDto {
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;
}
