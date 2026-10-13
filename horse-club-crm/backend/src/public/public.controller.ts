import { Controller, Get } from '@nestjs/common';
import { PublicService } from './public.service';

// Like LeadsController, this read-only controller intentionally has no JWT guard.
@Controller('public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get('content')
  content() {
    return this.service.content();
  }
}
