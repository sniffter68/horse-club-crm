import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { HorseWorkloadQueryDto } from './dto/horse-workload-query.dto';
import type { HorseWorkload } from './lessons.service';
import { LessonsService } from './lessons.service';

@ApiTags('Horses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('horses')
export class HorseWorkloadController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get(':id/workload')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['maxDailyMinutes', 'usedMinutes', 'remainingMinutes'],
      properties: {
        maxDailyMinutes: { type: 'number', example: 240 },
        usedMinutes: { type: 'number', example: 90 },
        remainingMinutes: { type: 'number', example: 150 },
      },
    },
  })
  getWorkload(
    @Param('id', new ParseUUIDPipe()) horseId: string,
    @Query() query: HorseWorkloadQueryDto,
  ): Promise<HorseWorkload> {
    return this.lessonsService.getHorseWorkload(horseId, query.date);
  }
}
