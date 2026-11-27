import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { IsIn } from 'class-validator';
import type { Request, Response } from 'express';
import { Role, SystemModule } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { refreshCookieName, refreshCookieOptions, sessionCookieName, sessionCookieOptions } from '../auth/session-cookie';
import type { AuthUser } from '../auth/auth.types';
import { DemoService } from './demo.service';
import { requireDemo, type DemoRole } from './demo.config';

export class DemoLoginDto {
  @IsIn(['OWNER', 'ADMIN', 'TRAINER'])
  role!: DemoRole;
}

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService, private readonly auth: AuthService) {}

  @Get('status')
  status(): { isDemo: boolean } { return { isDemo: process.env.DEMO_MODE === 'true' }; }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: DemoLoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    requireDemo();
    const result = await this.auth.loginDemo(dto.role);
    response.cookie(sessionCookieName(), result.access_token, sessionCookieOptions(request.headers.origin));
    response.cookie(refreshCookieName(), await this.auth.createRefreshToken(result.access_token), refreshCookieOptions(request.headers.origin));
    response.setHeader('Cache-Control', 'no-store');
    return { ...result, access_token: 'cookie-session' };
  }

  @Post('reset')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @RequireModule(SystemModule.CASHBOX)
  reset(@CurrentUser() user: AuthUser) { return this.demo.reset(user); }
}
