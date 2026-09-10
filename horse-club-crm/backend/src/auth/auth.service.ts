import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_ROUNDS } from './auth.config';
import type { AccessTokenResponse, AuthUser, JwtPayload } from './auth.types';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
  }

  async validateUser(email: string, password: string): Promise<AuthUser> {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, passwordHash: true },
    });
    // Perform bcrypt work for unknown emails as well.
    const valid = await compare(password, user?.passwordHash ?? this.dummyHash);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return { id: user.id, email: user.email, role: user.role };
  }

  async login(dto: LoginDto): Promise<AccessTokenResponse> {
    const user = await this.validateUser(dto.email, dto.password);
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { access_token: await this.jwt.signAsync(payload), user };
  }

  async register(dto: RegisterDto): Promise<AuthUser> {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('Password must not exceed 72 UTF-8 bytes');
    }
    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.user.create({
        data: { email: dto.email, passwordHash, role: dto.role },
        select: { id: true, email: true, role: true },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User already exists');
      }
      throw error;
    }
  }
}
