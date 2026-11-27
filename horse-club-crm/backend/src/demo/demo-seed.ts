import { Prisma, Role, SystemModule } from '@prisma/client';
import { DateTime } from 'luxon';
import { demoAccounts, demoId } from './demo.config';

/** Called only inside the demo service's locked transaction. Stable IDs make retries idempotent. */
export async function seedDemo(tx: Prisma.TransactionClient, passwordHash: string, now = new Date()): Promise<void> {
  const week = DateTime.fromJSDate(now, { zone: 'Europe/Moscow' }).startOf('week');
  const validTo = week.plus({ days: 35 }).toJSDate();
  const trainers = ['Марина Соколова', 'Андрей Лебедев', 'Елена Ветрова'];
  for (const [index, name] of trainers.entries()) {
    const id = demoId(1, index + 1);
    await tx.trainer.upsert({ where: { id }, update: {}, create: { id, name, fullName: name,
      qualification: 'Тренер по верховой езде', maxDailyLoad: 360, maxParallelLessons: 1 } });
  }
  for (const [key, account] of Object.entries(demoAccounts)) {
    await tx.user.upsert({ where: { id: account.id }, update: {}, create: {
      ...account, role: account.role, passwordHash, ...(key === 'TRAINER' ? { trainerId: demoId(1, 1) } : {}),
      staffProfile: { create: { fullName: key === 'OWNER' ? 'Олег Серебряков' : key === 'ADMIN' ? 'Анна Миронова' : trainers[0],
        roleTitle: key === 'TRAINER' ? 'Тренер' : key === 'OWNER' ? 'Владелец клуба' : 'Администратор' } },
    } });
  }
  for (let index = 1; index < 3; index++) {
    const id = demoId(2, index);
    await tx.user.upsert({ where: { id }, update: {}, create: { id, email: `trainer${index + 1}@silver-horses.example`,
      role: Role.TRAINER, trainerId: demoId(1, index + 1), passwordHash,
      staffProfile: { create: { fullName: trainers[index], roleTitle: 'Тренер' } } } });
  }
  for (const module of Object.values(SystemModule)) {
    await tx.clubModuleSettings.upsert({ where: { module }, update: {}, create: { module } });
    for (const role of [Role.MANAGER, Role.TRAINER]) {
      const accessLevel = role === Role.MANAGER || module === 'SCHEDULE' ? 'FULL'
        : module === 'STABLES' || module === 'VETERINARY' ? 'READ_ONLY' : 'HIDDEN';
      await tx.roleModulePermission.upsert({ where: { role_module: { role, module } },
        update: { accessLevel }, create: { role, module, accessLevel } });
    }
  }
  const clients = ['Алиса Морозова', 'Денис Орлов', 'Софья Волкова', 'Илья Зайцев', 'Полина Белова', 'Роман Лисин',
    'Дарья Лескова', 'Марк Озеров', 'Вера Рябинина', 'Никита Светлов', 'Кира Луговая', 'Павел Речной'];
  for (const [index, name] of clients.entries()) {
    const id = demoId(3, index + 1);
    const [firstName, lastName] = name.split(' ');
    await tx.client.upsert({ where: { id }, update: {}, create: { id, name, firstName, lastName,
      email: `rider${index + 1}@silver-horses.example`, isPayer: true, riderLevel: 'Любитель',
      preferences: 'Вымышленные данные · КСК Серебряная Подкова' } });
  }
  const horses = ['Алмаз', 'Буран', 'Вектор', 'Гранат', 'Дунай', 'Енисей', 'Жемчужина', 'Заря', 'Искра', 'Лада'];
  const buildingId = demoId(4, 1);
  await tx.stableBuilding.upsert({ where: { id: buildingId }, update: {}, create: { id: buildingId,
    name: 'КСК Серебряная Подкова', gridRows: 5, gridCols: 3, aisleCols: [2] } });
  for (const [index, name] of horses.entries()) {
    const id = demoId(5, index + 1);
    await tx.horse.upsert({ where: { id }, update: {}, create: { id, name, breed: index % 2 ? 'Орловская рысистая' : 'Русская верховая',
      birthYear: 2015 + index % 5, sex: index < 6 ? 'GELDING' : 'MARE', maxDailyMinutes: 180, maxDailyWorkloadMinutes: 180,
      ...(index < 4 ? { ownerType: 'private', ownerId: demoId(3, index + 1) } : {}) } });
    const stallId = demoId(6, index + 1);
    await tx.stall.upsert({ where: { id: stallId }, update: {}, create: { id: stallId, name: `Денник ${index + 1}`,
      number: String(index + 1), buildingId, row: Math.floor(index / 2) + 1, col: index % 2 ? 3 : 1,
      side: index % 2 ? 'RIGHT' : 'LEFT', position: Math.floor(index / 2) + 1, horseId: id, status: 'OCCUPIED' } });
    if (index < 4) await tx.boardingContract.upsert({ where: { id: demoId(7, index + 1) }, update: {}, create: {
      id: demoId(7, index + 1), clientId: demoId(3, index + 1), horseId: id, stallId, status: 'ACTIVE',
      startsAt: week.minus({ months: 1 }).toJSDate(), monthlyRate: 28000, notes: 'Полный пансион' } });
  }
  const serviceId = demoId(8, 1);
  await tx.service.upsert({ where: { id: serviceId }, update: {}, create: { id: serviceId, name: 'Индивидуальная тренировка',
    title: 'Индивидуальная тренировка', durationMinutes: 45, price: 2500, serviceDirection: 'allowIndividual' } });
  await tx.pricingPlan.upsert({ where: { id: demoId(9, 1) }, update: {}, create: {
    id: demoId(9, 1), name: 'Верховая езда · 8 занятий', totalLessons: 8, validDays: 35, price: 18000 } });
  const arenaId = demoId(10, 1);
  await tx.arena.upsert({ where: { id: arenaId }, update: {}, create: { id: arenaId, name: 'Крытый манеж', capacity: 6 } });
  for (let index = 0; index < 8; index++) {
    const id = demoId(11, index + 1);
    await tx.membership.upsert({ where: { id }, update: {}, create: { id, clientId: demoId(3, index + 1), serviceId,
      pricingPlanId: demoId(9, 1), title: 'Верховая езда · 8 занятий', serviceTitle: 'Индивидуальная тренировка',
      totalLessons: 8, remainedLessons: 8, initialUnits: 8, remainingUnits: 8, pricePerLesson: 2250, totalPrice: 18000,
      validFrom: week.toJSDate(), validTo, validUntil: validTo, soldById: demoAccounts.ADMIN.id, cashboxPosted: true } });
    await tx.payment.upsert({ where: { id: demoId(12, index + 1) }, update: {}, create: { id: demoId(12, index + 1),
      clientId: demoId(3, index + 1), membershipId: id, serviceId, amount: 18000, method: index % 2 ? 'SBP' : 'CASH',
      status: 'PAID', paidAt: week.toJSDate(), cashierId: demoAccounts.ADMIN.id, description: 'Покупка абонемента' } });
  }
  for (let index = 0; index < 4; index++) await tx.payment.upsert({ where: { id: demoId(13, index + 1) }, update: {}, create: {
    id: demoId(13, index + 1), clientId: demoId(3, index + 1), boardingContractId: demoId(7, index + 1), amount: 28000,
    method: 'TRANSFER', status: 'PAID', paidAt: week.toJSDate(), cashierId: demoAccounts.ADMIN.id, description: 'Оплата постоя' } });
  for (const [index, cashboxType] of ['MAIN', 'BOARDING'].entries()) await tx.expense.upsert({ where: { id: demoId(14, index + 1) },
    update: {}, create: { id: demoId(14, index + 1), amount: 4200 + index * 1800, paymentMethod: index ? 'CARD' : 'CASH',
      category: 'FEED', cashboxType, description: 'Закупка сена · демо', createdById: demoAccounts.ADMIN.id, date: week.toJSDate() } });
  for (let index = 0; index < 14; index++) {
    const start = week.plus({ days: Math.floor(index / 2), hours: 10 + index % 2 * 3 });
    const lessonId = demoId(15, index + 1);
    const trainerId = demoId(1, index % 3 + 1);
    await tx.lesson.upsert({ where: { id: lessonId }, update: {}, create: { id: lessonId, trainerId, serviceId, arenaId,
      startTime: start.toJSDate(), endTime: start.plus({ minutes: 45 }).toJSDate(), cost: 2500, pricePerPerson: 2500 } });
    await tx.booking.upsert({ where: { id: demoId(16, index + 1) }, update: {}, create: { id: demoId(16, index + 1),
      lessonId, clientId: demoId(3, index % 12 + 1), horseId: demoId(5, index % 6 + 5), trainerId, arenaId,
      startTime: start.toJSDate(), endTime: start.plus({ minutes: 45 }).toJSDate(), costAmount: 2500, serviceType: 'beginners' } });
  }
  await tx.clubSchedule.upsert({ where: { id: 1 }, update: {}, create: { id: 1, daysOfWeekOff: [] } });
}
