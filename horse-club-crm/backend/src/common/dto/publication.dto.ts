import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

export class PublicationDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value)
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048)
  imageUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsString() @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsString() @MaxLength(150)
  role?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt() @Min(0) @Max(2147483647)
  order?: number;
}
