import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsUUID } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VkLinkService } from './vk-link.service';
export class IssueVkLinkDto {
  @IsIn(['CLIENT', 'TRAINER']) kind!: 'CLIENT' | 'TRAINER';
  @IsUUID() id!: string;
}
@Controller('vk/link-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VkLinkController {
  constructor(private readonly links: VkLinkService) {}
  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  issue(@Body() dto: IssueVkLinkDto) { return this.links.issue(dto.kind, dto.id); }
}
