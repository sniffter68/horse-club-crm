import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Client } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery } from '../common/refine';
import type { PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<Client>> {
    const options = parseRefineQuery(query, ['id', 'name', 'phone', 'email', 'firstName', 'lastName', 'createdAt'], 'name');
    const where: Prisma.ClientWhereInput = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { phone: { contains: options.search, mode: 'insensitive' } },
            { email: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = { [options.sort]: options.order } as Prisma.ClientOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
      }),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Клиент не найден');
    return client;
  }

  async create(dto: CreateClientDto): Promise<Client> {
    const firstName = dto.firstName ?? dto.name;
    const lastName = dto.lastName ?? '';
    try {
      return await this.prisma.client.create({ data: { ...dto, firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' ') } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Клиент');
    }
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    try {
      const current = await this.findOne(id);
      const firstName = dto.firstName ?? (dto.name !== undefined ? dto.name : current.firstName);
      const lastName = dto.lastName ?? (dto.name !== undefined && dto.firstName === undefined ? '' : current.lastName);
      return await this.prisma.client.update({ where: { id }, data: { ...dto, firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' ') } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Клиент');
    }
  }

  async remove(id: string): Promise<Client> {
    try {
      return await this.prisma.client.delete({ where: { id } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Клиент');
    }
  }
}
