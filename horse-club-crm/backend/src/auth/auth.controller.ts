import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { sessionCookieName, sessionCookieOptions } from './session-cookie';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import type { AccessTokenResponse, AuthUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response): Promise<AccessTokenResponse> {
    const result = await this.auth.login(dto);
    response.cookie(sessionCookieName(), result.access_token, sessionCookieOptions());
    response.setHeader('Cache-Control', 'no-store');
    return { ...result, access_token: 'cookie-session' };
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  register(@Body() dto: RegisterDto): Promise<AuthUser> {
    return this.auth.register(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.logout(user);
    response.clearCookie(sessionCookieName(), { ...sessionCookieOptions(), maxAge: undefined });
    return result;
  }
}
