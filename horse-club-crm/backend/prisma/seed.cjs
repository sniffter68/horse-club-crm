const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  if (await prisma.stall.count() === 0) {
    await prisma.stall.createMany({ data: Array.from({ length: 16 }, (_, index) => {
      const n = index + 1, summer = n > 12;
      return { name: `${summer ? 'Летник' : 'Денник'} ${summer ? n - 12 : n}`,
        number: summer ? `Л-${n - 12}` : String(n), zone: summer ? 'SUMMER' : 'MAIN',
        side: n % 2 ? 'LEFT' : 'RIGHT', position: Math.ceil((summer ? n - 12 : n) / 2) };
    }), skipDuplicates: true });
  }
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@test.ru' },
    update: { passwordHash, role: 'ADMIN' },
    create: { email: 'admin@test.ru', passwordHash, role: 'ADMIN' },
  });

  await prisma.clubSchedule.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      openTime: '09:00',
      closeTime: '21:00',
      daysOfWeekOff: [1],
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
