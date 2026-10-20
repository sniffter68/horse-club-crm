import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const cleanText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class QuickCreateClientDto {
  @Transform(cleanText)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @Transform(({ value }) => { const cleaned = cleanText({ value }); return cleaned === '' ? undefined : cleaned; })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isOneTime?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  riderLevel?: string;
}
