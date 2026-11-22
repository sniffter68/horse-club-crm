import { CancelServiceDto } from '../payments/dto/cancel-service.dto';
import { TrainerTmaRescheduleDto, TrainerTmaRescheduleQuery, TrainerTmaStatusDto } from '../modules/telegram-bot/trainer-tma.dto';
import { TrainerStatusDto } from '../workspace/workspace.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CompleteLessonDto } from './dto/lesson-payment.dto';
import { PayWithMembershipDto } from './dto/pay-with-membership.dto';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { ListLessonsQueryDto } from './dto/list-lessons-query.dto';
import { LessonHistoryQueryDto } from './dto/lesson-history-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { RescheduleLessonDto, UpdateLessonStatusDto, UnlinkLessonMembershipDto } from './dto/update-lesson.dto';
import type { LessonDetails } from './lessons.service';
import { LessonsService } from './lessons.service';

export function trainerLessonView(lesson: LessonDetails, actor: AuthUser) {
  const isOwn = lesson.trainerId === actor.trainerId;
  return { id: lesson.id, trainerId: lesson.trainerId, startTime: lesson.startTime, endTime: lesson.endTime, status: lesson.status, isOwn,
    trainerNote: isOwn ? lesson.trainerNote : null,
    trainer: { id: lesson.trainer.id, name: lesson.trainer.name },
    service: { id: lesson.service.id, name: lesson.service.name, title: lesson.service.title },
    arena: lesson.arena ? { id: lesson.arena.id, name: lesson.arena.name } : null,
    bookings: lesson.bookings.map(row => ({ id: row.id, clientConfirmed: row.clientConfirmed,
      client: isOwn ? { id: row.client.id, name: row.client.name } : null,
      horse: row.horse ? { id: row.horse.id, name: row.horse.name } : null })),
  };
}

@ApiTags('Lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@RequireModule('SCHEDULE')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get(':id/management-details')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  managementDetails(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() actor: AuthUser) { return this.lessonsService.lessonManagementDetails(id, actor); }

  @Patch(':id/scheduled-reschedule')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async moveScheduled(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: TrainerTmaRescheduleDto, @CurrentUser() actor: AuthUser) {
    const row = await this.lessonsService.moveScheduledLesson(id, dto, actor);
    return { id: row.id, startTime: row.startTime };
  }

  @Get(':id/reschedule-slots')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  slots(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: TrainerTmaRescheduleQuery, @CurrentUser() actor: AuthUser) {
    return this.lessonsService.rescheduleSlots(id, query, actor);
  }

  @Patch(':id/scheduled-cancel')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async cancelScheduled(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: TrainerTmaStatusDto, @CurrentUser() actor: AuthUser) {
    if (dto.status !== 'CANCELLED') throw new BadRequestException('Выберите отмену занятия');
    const row = await this.lessonsService.updateLessonStatus(id, 'CANCELLED', {}, actor, { reason: dto.reason }, undefined, undefined, true);
    return { id: row.id, status: row.status };
  }

  @Patch(':id/trainer-status')
  @Roles(Role.TRAINER)
  async trainerStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: TrainerStatusDto, @CurrentUser() actor: AuthUser) {
    const lesson = await this.lessonsService.updateLessonStatus(id, dto.status, {}, actor, undefined, undefined, dto);
    return { id: lesson.id, status: lesson.status, trainerNote: lesson.trainerNote, isOwn: true };
  }

  @Get(':id/refund-quote')
  @Roles(Role.ADMIN, Role.MANAGER)
  refundQuote(@Param('id', new ParseUUIDPipe()) id: string) { return this.lessonsService.refundQuote(id); }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.MANAGER)
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CancelServiceDto, @CurrentUser() actor: AuthUser) {
    return this.lessonsService.deleteLesson(id, actor, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOkResponse({ description: 'Занятие удалено; списания возвращены, кассовая история сохранена.' })
  remove(@Param('id', new ParseUUIDPipe()) lessonId: string, @CurrentUser() actor: AuthUser, @Body() dto?: CancelServiceDto) {
    return this.lessonsService.deleteLesson(lessonId, actor, dto);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiCreatedResponse({ description: 'Занятие создано.' })
  async create(@Body() dto: CreateLessonDto, @CurrentUser() actor: AuthUser) {
    const created = await this.lessonsService.createLesson(dto, undefined, actor);
    return actor.role === Role.TRAINER ? trainerLessonView(created, actor) : created;
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({ description: 'Список занятий в заданном интервале.' })
  async findAll(@Query() query: ListLessonsQueryDto, @CurrentUser() actor: AuthUser) {
    const rows = await this.lessonsService.findAll(query);
    return actor.role === 'TRAINER' ? rows.map(row => trainerLessonView(row, actor)) : rows;
  }

  @Get('history')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({ description: 'Постраничный журнал занятий с фильтрами.' })
  async findHistory(@Query() query: LessonHistoryQueryDto, @Res({ passthrough: true }) response: Response, @CurrentUser() actor: AuthUser) {
    const { data, total } = await this.lessonsService.findHistory(query);
    setRefineTotalHeaders(response, total);
    return actor.role === 'TRAINER' ? data.map(row => trainerLessonView(row, actor)) : data;
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOkResponse({ description: 'Статус занятия изменён.' })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) lessonId: string,
    @Body() dto: UpdateLessonStatusDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<LessonDetails> {
    return this.lessonsService.updateLessonStatus(lessonId, dto.status, dto, actor, dto.status === 'CANCELLED' ? dto : undefined);
  }

  @Post(':id/complete')
  @Roles(Role.ADMIN, Role.MANAGER)
  complete(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CompleteLessonDto, @CurrentUser() actor: AuthUser) {
    return this.lessonsService.updateLessonStatus(id, 'COMPLETED', dto, actor);
  }

  @Post(':id/pay-with-membership')
  @Roles(Role.ADMIN, Role.MANAGER)
  payWithMembership(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: PayWithMembershipDto, @CurrentUser() actor: AuthUser) {
    return this.lessonsService.payWithMembership(id, dto.membershipId, actor);
  }

  @Post(':id/bookings/:bookingId/unlink-membership')
  @Roles(Role.ADMIN, Role.MANAGER)
  unlinkMembership(@Param('id', new ParseUUIDPipe()) id: string, @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Body() dto: UnlinkLessonMembershipDto, @CurrentUser() actor: AuthUser) {
    return this.lessonsService.unlinkMembership(id, bookingId, dto.reason, actor);
  }

  @Patch(':id/reschedule')
  @Roles(Role.ADMIN, Role.MANAGER)
  reschedule(@Param('id', new ParseUUIDPipe()) lessonId: string, @Body() dto: RescheduleLessonDto, @CurrentUser() actor: AuthUser): Promise<LessonDetails> {
    return this.lessonsService.rescheduleLesson(lessonId, dto.startTime, dto.durationMinutes, dto.trainerId, dto.arenaId, actor);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({ description: 'Карточка занятия и список участников.' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) lessonId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    const lesson = await this.lessonsService.findOne(lessonId);
    return actor.role === 'TRAINER' ? trainerLessonView(lesson, actor) : lesson;
  }
}
