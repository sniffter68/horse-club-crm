const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
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
      dayOfWeekOff: 1,
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
