import { Body, Controller, Get, Header, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Req, UnauthorizedException, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { WorkspaceService } from '../../workspace/workspace.service';
import { LessonsService } from '../../lessons/lessons.service';
import { TrainerBoardQuery, TrainerStatusDto } from '../../workspace/workspace.dto';
import { ModuleAccessGuard, RequireModule } from '../../auth/module-access.guard';
import { TrainerTmaAuthDto, TrainerTmaHorseDto, TrainerTmaScheduleQuery, TrainerTmaStatusDto } from './trainer-tma.dto';
import { TrainerTmaService, type TrainerTmaActor } from './trainer-tma.service';

interface TrainerTmaRequest extends Request { user: TrainerTmaActor }

@Injectable()
export class TrainerTmaGuard implements CanActivate {
  constructor(private readonly service: TrainerTmaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<TrainerTmaRequest>();
    const token = /^Bearer (\S+)$/i.exec(req.get('Authorization') ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Требуется сессия Telegram');
    req.user = await this.service.session(token);
    return true;
  }
}

@Controller('tma')
export class TrainerTmaAuthController {
  constructor(private readonly service: TrainerTmaService) {}
  @Post('bootstrap') @Header('Cache-Control', 'no-store')
  bootstrap(@Body() dto: TrainerTmaAuthDto) { return this.service.bootstrap(dto.initData); }
  @Post('auth') @Header('Cache-Control', 'no-store')
  auth(@Body() dto: TrainerTmaAuthDto) { return this.service.authenticate(dto.initData); }
}

@Controller('tma')
@RequireModule('SCHEDULE')
@UseGuards(TrainerTmaGuard, ModuleAccessGuard)
export class TrainerBoardTmaController {
  constructor(private readonly workspace: WorkspaceService, private readonly lessons: LessonsService) {}
  @Get('workspace/trainer-board') @Header('Cache-Control', 'no-store')
  board(@Req() req: TrainerTmaRequest, @Query() query: TrainerBoardQuery) { return this.workspace.trainerBoard(req.user, query.date); }
  @Patch('lessons/:id/trainer-status')
  async trainerStatus(@Req() req: TrainerTmaRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: TrainerStatusDto) {
    const row = await this.lessons.updateLessonStatus(id, dto.status, {}, req.user, undefined, req.user.telegramUserId, dto);
    return { id: row.id, status: row.status, trainerNote: row.trainerNote, isOwn: true };
  }
}

@Controller('tma')
@RequireModule('SCHEDULE')
@UseGuards(TrainerTmaGuard, ModuleAccessGuard)
export class TrainerTmaController {
  constructor(private readonly service: TrainerTmaService) {}
  @Get('schedule') @Header('Cache-Control', 'no-store')
  schedule(@Req() req: TrainerTmaRequest, @Query() query: TrainerTmaScheduleQuery) { return this.service.schedule(req.user, query.date); }
  @Get('admin/schedule') @Header('Cache-Control', 'no-store')
  adminSchedule(@Req() req: TrainerTmaRequest, @Query() query: TrainerTmaScheduleQuery) { return this.service.schedule(req.user, query.date, true); }
  @Patch('lessons/:id/status')
  status(@Req() req: TrainerTmaRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: TrainerTmaStatusDto) { return this.service.status(req.user, id, dto); }
  @Patch('lessons/:id/horse')
  horse(@Req() req: TrainerTmaRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: TrainerTmaHorseDto) { return this.service.horse(req.user, id, dto); }
  @Get('horses') @Header('Cache-Control', 'no-store')
  horses() { return this.service.horses(); }
}
