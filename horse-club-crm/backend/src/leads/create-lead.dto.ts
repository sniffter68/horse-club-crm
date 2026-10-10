import { Expose, Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsBoolean()
  @Equals(true, { message: 'Необходимо подтвердить согласие на обработку персональных данных' })
  consentAccepted!: boolean;

  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{1,64}$/, { message: 'Некорректная версия согласия' })
  consentVersion!: string;

  @IsString()
  @Expose()
  @Transform(({ value, obj }: { value: unknown; obj: { name?: unknown } }) => {
    const name = value ?? obj.name;
    return typeof name === 'string' ? name.trim() : name;
  })
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  direction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @Equals('landing')
  source?: 'landing';

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value)
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone должен быть в международном формате, например +79991234567' })
  @IsPhoneNumber()
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  preferences?: string;
}
