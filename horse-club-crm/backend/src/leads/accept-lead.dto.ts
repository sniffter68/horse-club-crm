import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, Matches, MaxLength } from 'class-validator';

export class AcceptLeadDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty()
  @MaxLength(75)
  firstName!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @MaxLength(74)
  lastName?: string;

  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/)
  @IsPhoneNumber()
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  preferences?: string;

  @IsBoolean()
  isRider!: boolean;

  @IsBoolean()
  isPayer!: boolean;
}
