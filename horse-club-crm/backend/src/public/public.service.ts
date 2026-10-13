import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async content() {
    // Explicit allowlists: never expose contact, health, ownership or payroll data.
    const orderBy = [{ order: 'asc' as const }, { id: 'asc' as const }];
    const [horses, trainers, services] = await Promise.all([
      this.prisma.horse.findMany({
        where: { isPublic: true, status: 'active', isUnavailable: false }, orderBy,
        select: { id: true, name: true, breed: true, riderLevel: true, role: true, description: true, imageUrl: true },
      }),
      this.prisma.trainer.findMany({
        where: { isPublic: true, isActive: true }, orderBy,
        select: { id: true, name: true, role: true, qualification: true, specializations: true, description: true, imageUrl: true },
      }),
      this.prisma.service.findMany({
        where: { isPublic: true }, orderBy,
        select: { id: true, name: true, title: true, role: true, durationMinutes: true, price: true, description: true, imageUrl: true },
      }),
    ]);
    return { horses, trainers, services };
  }
}
