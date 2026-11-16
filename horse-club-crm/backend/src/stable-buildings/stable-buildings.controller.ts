import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission, RoleAccessGuard } from '../auth/role-access.guard';
import { CreateBuildingDto, UpdateBuildingDto } from './building.dto';
import { StableBuildingsService } from './stable-buildings.service';
@Controller('stable-buildings')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard, RoleAccessGuard)
@RequirePermission('boardingAccess') @RequireModule('STABLES')
export class StableBuildingsController {
 constructor(private readonly service: StableBuildingsService) {}
 @Get() @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER, Role.STABLE_WORKER) findAll() { return this.service.findAll(); }
 @Post() @Roles(Role.ADMIN, Role.MANAGER) create(@Body() dto: CreateBuildingDto) { return this.service.create(dto); }
 @Patch(':id') @Roles(Role.ADMIN, Role.MANAGER) update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateBuildingDto) { return this.service.update(id, dto); }
 @Delete(':id') @Roles(Role.ADMIN, Role.MANAGER) remove(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.remove(id); }
}
