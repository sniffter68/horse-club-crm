import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function rethrowCatalogMutation(error: unknown, entityName: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new ConflictException(`${entityName} с такими уникальными данными уже существует`);
    if (error.code === 'P2025') throw new NotFoundException(`${entityName} не найден`);
    if (error.code === 'P2003') {
      throw new ConflictException(`${entityName} используется в других записях`);
    }
  }
  throw error;
}
