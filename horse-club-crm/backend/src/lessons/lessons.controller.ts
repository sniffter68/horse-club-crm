import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { UpdateLessonStatusDto } from './dto/update-lesson.dto';
import type { LessonDetails } from './lessons.service';
import { LessonsService } from './lessons.service';

@ApiTags('Lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiCreatedResponse({ description: 'Занятие создано.' })
  create(@Body() dto: CreateLessonDto): Promise<LessonDetails> {
    return this.lessonsService.createLesson(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({ description: 'Список занятий в заданном интервале.' })
  findAll(@Query() query: ListLessonsQueryDto): Promise<LessonDetails[]> {
    return this.lessonsService.findAll(query);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({ description: 'Статус занятия изменён.' })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) lessonId: string,
    @Body() dto: UpdateLessonStatusDto,
  ): Promise<LessonDetails> {
    return this.lessonsService.updateLessonStatus(lessonId, dto.status);
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
