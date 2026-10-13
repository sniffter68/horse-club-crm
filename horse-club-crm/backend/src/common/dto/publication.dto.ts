import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, isURL, Max, MaxLength, Min, ValidateBy } from 'class-validator';

export class PublicationDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value)
  @IsOptional() @ValidateBy({ name: 'imageUrl', validator: {
    validate: (value: unknown) => typeof value === 'string' && (
      /^\/uploads\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/.test(value)
      || isURL(value, { protocols: ['http', 'https'], require_protocol: true })
    ),
    defaultMessage: () => 'imageUrl must be an HTTP(S) URL or an uploaded image path',
  } }) @MaxLength(2048)
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
