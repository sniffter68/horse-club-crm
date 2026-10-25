import { CancelServiceDto } from '../payments/dto/cancel-service.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CompleteLessonDto } from './dto/lesson-payment.dto';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import {
  Body,
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
import { RescheduleLessonDto, UpdateLessonStatusDto } from './dto/update-lesson.dto';
import type { LessonDetails } from './lessons.service';
import { LessonsService } from './lessons.service';

@ApiTags('Lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@RequireModule('SCHEDULE')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

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
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiCreatedResponse({ description: 'Занятие создано.' })
  create(@Body() dto: CreateLessonDto, @CurrentUser() actor: AuthUser): Promise<LessonDetails> {
    return this.lessonsService.createLesson(dto, undefined, actor);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({ description: 'Список занятий в заданном интервале.' })
  findAll(@Query() query: ListLessonsQueryDto): Promise<LessonDetails[]> {
    return this.lessonsService.findAll(query);
  }

  @Get('history')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({ description: 'Постраничный журнал занятий с фильтрами.' })
  async findHistory(@Query() query: LessonHistoryQueryDto, @Res({ passthrough: true }) response: Response): Promise<LessonDetails[]> {
    const { data, total } = await this.lessonsService.findHistory(query);
    setRefineTotalHeaders(response, total);
    return data;
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

  @Patch(':id/reschedule')
  @Roles(Role.ADMIN, Role.MANAGER)
  reschedule(@Param('id', new ParseUUIDPipe()) lessonId: string, @Body() dto: RescheduleLessonDto): Promise<LessonDetails> {
    return this.lessonsService.rescheduleLesson(lessonId, dto.startTime, dto.durationMinutes);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({ description: 'Карточка занятия и список участников.' })
  findOne(
    @Param('id', new ParseUUIDPipe()) lessonId: string,
  ): Promise<LessonDetails> {
    return this.lessonsService.findOne(lessonId);
  }
}
