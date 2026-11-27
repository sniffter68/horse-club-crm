import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { VkLinkService } from '../vk-bot/vk-link.service';

export function verifyVkLaunchParams(input: string, secret: string, appId?: string): string {
  if (!secret) throw new ServiceUnavailableException('VK Mini App не настроено');
  const params = new URLSearchParams(input.replace(/^\?/, ''));
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new UnauthorizedException('Duplicate launch parameters');
  const sign = params.get('sign') ?? '';
  const canonical = new URLSearchParams([...params.entries()].filter(([key]) => key.startsWith('vk_')).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)).toString();
  const expected = createHmac('sha256', secret).update(canonical).digest('base64url');
  if (!/^[A-Za-z0-9_-]{43}$/.test(sign) || !timingSafeEqual(Buffer.from(expected), Buffer.from(sign))) throw new UnauthorizedException('Invalid VK signature');
  const userId = params.get('vk_user_id') ?? '';
  const timestamp = Number(params.get('vk_ts'));
  if (!/^[1-9]\d{0,15}$/.test(userId) || !Number.isSafeInteger(Number(userId)) || !Number.isSafeInteger(timestamp)
    || Math.abs(Date.now() / 1000 - timestamp) > 86400 || (appId && params.get('vk_app_id') !== appId)) throw new UnauthorizedException('Invalid VK launch parameters');
  return userId;
}

@Injectable()
export class VkMiniAppService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly links: VkLinkService) {}

  verify(launchParams: string): string {
    return verifyVkLaunchParams(launchParams, process.env.VK_MINI_APP_SECRET ?? '', process.env.VK_MINI_APP_ID);
  }

  async login(launchParams: string) {
    const vkUserId = this.verify(launchParams);
    const user = await this.prisma.user.findFirst({ where: { OR: [{ vkUserId: BigInt(vkUserId) }, { vkId: vkUserId }, { trainer: { vkId: BigInt(vkUserId) } }] }, include: { staffProfile: true, trainer: true } });
    if (user) {
      if (!user.crmAccess || user.staffProfile?.isActive === false || user.trainer?.isActive === false || !['ADMIN', 'TRAINER'].includes(user.role)) throw new UnauthorizedException('Доступ отключён');
      return { status: 'LINKED' as const, role: user.role, user: { id: user.id, email: user.email, role: user.role },
        access_token: await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, authVersion: String(user.tokenVersion) }) };
    }
    const client = await this.prisma.client.findFirst({ where: { OR: [{ vkUserId: BigInt(vkUserId) }, { vkId: vkUserId }] } });
    if (!client) return { status: 'UNLINKED' as const, vkUserId };
    if (client.deletedAt) throw new UnauthorizedException('Профиль в архиве');
    return { status: 'LINKED' as const, role: 'CLIENT' as const, clientId: client.id,
      user: { id: client.id, role: 'CLIENT' as const }, access_token: await this.jwt.signAsync({ sub: client.id, vkUserId, tokenType: 'vk-client-tma' }, { audience: 'client-tma', expiresIn: '1h' }) };
  }

  async link(launchParams: string, phone: string, code: string) {
    const vkUserId = this.verify(launchParams);
    await this.links.bind(Number(vkUserId), phone, code);
    return this.login(launchParams);
  }
}
