import { Injectable, NotFoundException } from '@nestjs/common';
import { BoardingContractStatus, Prisma } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStallDto } from './dto/create-stall.dto';
import type { UpdateStallDto } from './dto/update-stall.dto';

const stallInclude = Prisma.validator<Prisma.StallDefaultArgs>()({
  include: {
    contracts: {
      where: { status: { in: [BoardingContractStatus.DRAFT, BoardingContractStatus.ACTIVE, BoardingContractStatus.SUSPENDED] } },
      include: {
        horse: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, firstName: true, lastName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    },
  },
});
export type StallWithContracts = Prisma.StallGetPayload<typeof stallInclude>;

@Injectable()
export class StallsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<StallWithContracts>> {
    const options = parseRefineQuery(
      query,
      ['id', 'name', 'isUnavailable', 'createdAt', 'updatedAt'],
      'name',
    );
    const where: Prisma.StallWhereInput = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { description: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = { [options.sort]: options.order } as Prisma.StallOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.stall.count({ where }),
      this.prisma.stall.findMany({
        where,
        include: stallInclude.include,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
      }),
    ]);
    return { total, data };
  }

  async findOne(id: string): Promise<StallWithContracts> {
    const stall = await this.prisma.stall.findUnique({ where: { id }, include: stallInclude.include });
    if (!stall) throw new NotFoundException('Денник не найден');
    return stall;
  }

  async create(dto: CreateStallDto): Promise<StallWithContracts> {
    try {
      return await this.prisma.stall.create({ data: this.normalize(dto), include: stallInclude.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  async update(id: string, dto: UpdateStallDto): Promise<StallWithContracts> {
    try {
      return await this.prisma.stall.update({ where: { id }, data: this.normalize(dto), include: stallInclude.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  async remove(id: string): Promise<StallWithContracts> {
    try {
      return await this.prisma.stall.delete({ where: { id }, include: stallInclude.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  private normalize<T extends CreateStallDto | UpdateStallDto>(dto: T): T {
    return {
      ...dto,
      ...(dto.name !== undefined ? { name: dto.name.trim().replace(/\s+/g, ' ') } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || undefined } : {}),
    };
  }
}
