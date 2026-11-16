import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { validateBuildingGrid, validateGridBlock } from '../stalls/grid';
import { CreateBuildingDto, UpdateBuildingDto } from './building.dto';
@Injectable()
export class StableBuildingsService {
 constructor(private readonly prisma: PrismaService) {}
 async findAll() {
  const buildings = await this.prisma.stableBuilding.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }], include: { stalls: { select: { type: true, status: true, horseId: true, isUnavailable: true } } } });
  return buildings.map(({ stalls, ...building }) => ({ ...building, total: stalls.filter(s => s.type !== 'SERVICE').length,
   occupied: stalls.filter(s => s.type !== 'SERVICE' && s.horseId).length,
   available: stalls.filter(s => s.type !== 'SERVICE' && s.status === 'AVAILABLE' && !s.isUnavailable && !s.horseId).length,
   roomCount: stalls.length }));
 }
 async create(dto: CreateBuildingDto) {
  const data = { gridRows: 10, gridCols: 4, aisleCols: [2, 3], ...dto };
  validateBuildingGrid(data);
  return this.mutate(tx => tx.stableBuilding.create({ data }));
 }
 async update(id: string, dto: UpdateBuildingDto) {
  return this.mutate(async tx => {
   const current = await tx.stableBuilding.findUnique({ where: { id } });
   if (!current) throw new NotFoundException('Корпус не найден');
   const grid = { ...current, ...dto }; validateBuildingGrid(grid);
   const stalls = await tx.stall.findMany({ where: { buildingId: id } });
   stalls.forEach(s => validateGridBlock(s, grid, []));
   return tx.stableBuilding.update({ where: { id }, data: dto });
  });
 }
 async remove(id: string) {
  return this.mutate(async tx => {
   if (!await tx.stableBuilding.findUnique({ where: { id } })) throw new NotFoundException('Корпус не найден');
   if (await tx.stall.count({ where: { buildingId: id } })) throw new BadRequestException('Сначала удалите или перенесите все денники и помещения корпуса');
   return tx.stableBuilding.delete({ where: { id } });
  });
 }
 private async mutate<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  catch (error) {
   if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new BadRequestException('Корпус с таким названием уже существует');
    if (error.code === 'P2003') throw new BadRequestException('В корпусе есть денники или помещения');
    if (error.code === 'P2034') throw new ConflictException('Схема изменилась. Обновите карту и повторите');
   }
   throw error;
  }
 }
}
