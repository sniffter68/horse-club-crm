import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ArenasController } from './arenas.controller';
import { ArenasService } from './arenas.service';

@Module({ imports: [AuthModule], controllers: [ArenasController], providers: [ArenasService], exports: [ArenasService] })
export class ArenasModule {}
