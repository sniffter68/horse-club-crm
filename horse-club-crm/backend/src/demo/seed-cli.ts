import 'reflect-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { DemoService } from './demo.service';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  try { await new DemoService(prisma).initialize(); }
  finally { await prisma.$disconnect(); }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Demo initialization failed');
  process.exitCode = 1;
});
