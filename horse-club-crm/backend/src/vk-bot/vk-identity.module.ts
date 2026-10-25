import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VkIdentityService } from './vk-identity.service';
@Module({ imports: [PrismaModule], providers: [VkIdentityService], exports: [VkIdentityService] })
export class VkIdentityModule {}
