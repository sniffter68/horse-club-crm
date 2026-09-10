import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import type { RefineQueryDto } from './dto/refine-query.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export interface RefineListOptions {
  skip: number;
  take: number;
  order: 'asc' | 'desc';
  sort: string;
  search?: string;
}

export function parseRefineQuery(
  query: RefineQueryDto,
  allowedSortFields: readonly string[],
  defaultSort = 'name',
): RefineListOptions {
  const start = query._start ?? 0;
  const end = query._end ?? 10;
  if (end < start) {
    throw new BadRequestException('_end должен быть больше или равен _start');
  }
  const sort = query._sort ?? defaultSort;
  if (!allowedSortFields.includes(sort)) {
    throw new BadRequestException(`Недопустимое поле сортировки: ${sort}`);
  }
  const search = query.q?.trim();
  return {
    skip: start,
    take: end - start,
    sort,
    order: (query._order ?? 'ASC').toLowerCase() as 'asc' | 'desc',
    ...(search ? { search } : {}),
  };
}

export function setRefineTotalHeaders(response: Response, total: number): void {
  response.setHeader('x-total-count', total.toString());
  response.setHeader('Access-Control-Expose-Headers', 'x-total-count');
}
