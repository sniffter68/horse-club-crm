import { PartialType } from '@nestjs/swagger';
import { CreateHorseHealthLogDto } from './create-horse-health-log.dto';

export class UpdateHorseHealthLogDto extends PartialType(CreateHorseHealthLogDto) {}
