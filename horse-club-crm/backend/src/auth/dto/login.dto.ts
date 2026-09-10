import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { PreserveInput } from '../decorators/preserve-input.decorator';

export class LoginDto {
  @ApiProperty({ example: 'manager@example.com' })
  @IsEmail()
  @PreserveInput()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', writeOnly: true })
  @IsString()
  @PreserveInput()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
