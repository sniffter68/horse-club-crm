import { VkIdentityModule } from '../vk-bot/vk-identity.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ imports: [VkIdentityModule, AuthModule], controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
