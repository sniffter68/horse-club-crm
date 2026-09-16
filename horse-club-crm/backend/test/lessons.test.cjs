const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const { LessonStatus, MembershipOpType, Prisma } = require('@prisma/client');
const { LessonsService } = require('../dist/lessons/lessons.service');

const scheduled = {
  id: 'lesson-1',
  trainerId: 'trainer-1',
  arenaId: null,
  bookings: [{ horseId: 'horse-1' }],
  status: LessonStatus.SCHEDULED,
  startTime: new Date('2026-09-07T10:00:00.000Z'),
  endTime: new Date('2026-09-07T11:00:00.000Z'),
};

function matchesConflict(lesson, where) {
  const resourceMatches = where.OR.some((condition) =>
    (condition.trainerId && lesson.trainerId === condition.trainerId) ||
    (condition.arenaId && lesson.arenaId === condition.arenaId) ||
    (condition.bookings?.some?.horseId && lesson.bookings.some((booking) => booking.horseId === condition.bookings.some.horseId)));
  return (
    lesson.status !== where.status.not &&
    resourceMatches &&
    lesson.startTime < where.startTime.lt &&
    lesson.endTime > where.endTime.gt &&
    (!where.id || lesson.id !== where.id.not)
  );
}

function prismaWithLessons(lessons) {
  return {
    lesson: {
      findMany: async ({ where }) => lessons
        .filter((lesson) => matchesConflict(lesson, where))
        .map(({ trainerId, arenaId, bookings }) => ({ trainerId, arenaId, bookings })),
    },
  };
}

const unusedLedger = {};

test('lesson history applies server pagination and relation filters', async () => {
  let countArgs;
  let listArgs;
  const prisma = {
    $transaction: async operations => Promise.all(operations),
    lesson: {
      count: async args => { countArgs = args; return 1; },
      findMany: async args => { listArgs = args; return [{ id: 'lesson-history-1' }]; },
    },
  };
  const service = new LessonsService(prisma, unusedLedger);
  const result = await service.findHistory({
    _start: 20, _end: 40, _sort: 'startTime', _order: 'DESC', q: 'Анна',
    from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T23:59:59.999Z',
    status: LessonStatus.COMPLETED, trainerId: '11111111-1111-4111-8111-111111111111',
    clientId: '22222222-2222-4222-8222-222222222222', horseId: '33333333-3333-4333-8333-333333333333',
  });
  assert.equal(result.total, 1);
  assert.equal(result.data[0].id, 'lesson-history-1');
  assert.equal(listArgs.skip, 20);
  assert.equal(listArgs.take, 20);
  assert.deepEqual(listArgs.orderBy, [{ startTime: 'desc' }, { id: 'asc' }]);
  assert.equal(listArgs.where.status, LessonStatus.COMPLETED);
  assert.equal(listArgs.where.trainerId, '11111111-1111-4111-8111-111111111111');
  assert.deepEqual(listArgs.where.startTime, {
    gte: new Date('2026-09-01T00:00:00.000Z'), lte: new Date('2026-09-30T23:59:59.999Z'),
  });
  assert.equal(countArgs.where, listArgs.where);
  assert.equal(listArgs.where.OR.length, 6);
});

test('blocks a mathematically overlapping trainer interval', async () => {
  const service = new LessonsService(prismaWithLessons([scheduled]), unusedLedger);
  await assert.rejects(
    service.validateNoConflicts(
      'trainer-1',
      'horse-2',
      new Date('2026-09-07T10:30:00.000Z'),
      new Date('2026-09-07T11:30:00.000Z'),
    ),
    (error) => error.getStatus() === 409 &&
      error.message === 'Тренер уже занят в этот интервал времени',
  );
});

test('blocks a mathematically overlapping horse interval', async () => {
  const service = new LessonsService(prismaWithLessons([scheduled]), unusedLedger);
  await assert.rejects(
    service.validateNoConflicts(
      'trainer-2',
      'horse-1',
      new Date('2026-09-07T10:15:00.000Z'),
      new Date('2026-09-07T10:45:00.000Z'),
    ),
    (error) => error.getStatus() === 409 &&
      error.message === 'Лошадь уже забронирована на это время',
  );
});

test('blocks a mathematically overlapping arena interval', async () => {
  const service = new LessonsService(prismaWithLessons([{
    ...scheduled,
    trainerId: 'trainer-2',
    arenaId: 'arena-1',
    bookings: [],
  }]), unusedLedger);
  await assert.rejects(
    service.validateNoConflicts(
      'trainer-1',
      undefined,
      new Date('2026-09-07T10:15:00.000Z'),
      new Date('2026-09-07T10:45:00.000Z'),
      undefined,
      'arena-1',
    ),
    (error) => error.getStatus() === 409 && error.message === 'Манеж уже занят в это время',
  );
});

test('CANCELLED lessons do not block the same slot and touching intervals are allowed', async () => {
  const service = new LessonsService(
    prismaWithLessons([{ ...scheduled, status: LessonStatus.CANCELLED }]),
    unusedLedger,
  );
  await service.validateNoConflicts(
    'trainer-1',
    'horse-1',
    new Date('2026-09-07T10:00:00.000Z'),
    new Date('2026-09-07T11:00:00.000Z'),
  );

  const activeService = new LessonsService(prismaWithLessons([scheduled]), unusedLedger);
  await activeService.validateNoConflicts(
    'trainer-1',
    'horse-1',
    new Date('2026-09-07T11:00:00.000Z'),
    new Date('2026-09-07T12:00:00.000Z'),
  );
});

test('excludeLessonId omits the edited lesson from conflict detection', async () => {
  const service = new LessonsService(prismaWithLessons([scheduled]), unusedLedger);
  await service.validateNoConflicts(
    'trainer-1',
    'horse-1',
    new Date('2026-09-07T10:15:00.000Z'),
    new Date('2026-09-07T10:45:00.000Z'),
    'lesson-1',
  );
});

test('create uses service duration and adds a pending payment for a booking without membership', async () => {
  let createArgs;
  let transactionOptions;
  const tx = {
    clubSchedule: {
      findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', dayOfWeekOff: 1 }),
    },
    horse: {
      findUnique: async () => ({ name: 'Буран', maxDailyMinutes: 240 }),
    },
    service: { findUnique: async () => ({ durationMinutes: 45, price: 1500, title: 'Тренировка', name: 'Тренировка' }) },
    lesson: {
      findMany: async () => [],
      create: async (args) => {
        createArgs = args;
        return { id: 'lesson-new', ...args.data, bookings: [] };
      },
    },
  };
  const prisma = {
    $transaction: async (callback, options) => {
      transactionOptions = options;
      return callback(tx);
    },
  };
  const service = new LessonsService(prisma, unusedLedger);
  const result = await service.createLesson({
    trainerId: 'trainer-1',
    horseId: 'horse-1',
    serviceId: 'service-1',
    clientId: 'client-1',
    startTime: '2026-09-08T10:00:00.000Z',
  });

  assert.equal(createArgs.data.endTime.toISOString(), '2026-09-08T10:45:00.000Z');
  assert.equal(createArgs.data.status, LessonStatus.SCHEDULED);
  assert.deepEqual(createArgs.data.bookings.create, {
    clientId: 'client-1', horseId: 'horse-1', payments: { create: {
      clientId: 'client-1', amount: 1500, method: 'UNSPECIFIED', status: 'PENDING',
      description: 'Начисление за занятие: Тренировка',
    } },
  });
  assert.equal(result.id, 'lesson-new');
  assert.deepEqual(transactionOptions, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5000,
    timeout: 10000,
  });
});

test('creation rejects an unavailable arena', async () => {
  const tx = {
    service: { findUnique: async () => ({ durationMinutes: 45 }) },
    arena: { findUnique: async () => ({ name: 'Открытый плац', isUnavailable: true }) },
  };
  const prisma = { $transaction: async callback => callback(tx) };
  const service = new LessonsService(prisma, unusedLedger);
  await assert.rejects(
    service.createLesson({
      trainerId: 'trainer-1',
      serviceId: 'service-1',
      arenaId: 'arena-1',
      startTime: '2026-09-08T10:00:00.000Z',
    }),
    (error) => error.getStatus() === 409 && error.message === 'Манеж "Открытый плац" недоступен',
  );
});

test('creation retries P2034 and list query uses interval intersection filters', async () => {
  let attempts = 0;
  let listArgs;
  const serializationFailure = new Prisma.PrismaClientKnownRequestError(
    'Serialization failure',
    {
      code: 'P2034',
      clientVersion: Prisma.prismaVersion.client,
    },
  );
  const tx = {
    clubSchedule: {
      findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', dayOfWeekOff: 1 }),
    },
    horse: {
      findUnique: async () => ({ name: 'Буран', maxDailyMinutes: 240 }),
    },
    service: { findUnique: async () => ({ durationMinutes: 30 }) },
    lesson: {
      findMany: async () => [],
      create: async ({ data }) => ({ id: 'lesson-new', ...data }),
    },
  };
  const prisma = {
    $transaction: async (callback) => {
      attempts += 1;
      if (attempts === 1) throw serializationFailure;
      return callback(tx);
    },
    lesson: {
      findMany: async (args) => {
        listArgs = args;
        return [];
      },
    },
  };
  const service = new LessonsService(prisma, unusedLedger);
  await service.createLesson({
    trainerId: 'trainer-1',
    serviceId: 'service-1',
    startTime: '2026-09-08T10:00:00.000Z',
  });
  assert.equal(attempts, 2);

  await service.findAll({
    from: '2026-09-07T00:00:00.000Z',
    to: '2026-09-08T00:00:00.000Z',
    trainerId: 'trainer-1',
    arenaId: 'arena-1',
    status: LessonStatus.SCHEDULED,
  });
  assert.deepEqual(listArgs.where, {
    trainerId: 'trainer-1',
    arenaId: 'arena-1',
    status: LessonStatus.SCHEDULED,
    endTime: { gt: new Date('2026-09-07T00:00:00.000Z') },
    startTime: { lt: new Date('2026-09-08T00:00:00.000Z') },
  });
});

test('rejects lessons on the configured club day off', async () => {
  const prisma = {
    clubSchedule: {
      findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', dayOfWeekOff: 1 }),
    },
  };
  const service = new LessonsService(prisma, unusedLedger);

  // 2026-09-07 is Monday; 07:00Z is 10:00 in Europe/Moscow.
  await assert.rejects(
    service.validateClubWorkingHours(
      new Date('2026-09-07T07:00:00.000Z'),
      new Date('2026-09-07T08:00:00.000Z'),
    ),
    (error) => error.getStatus() === 400 &&
      error.message === 'Клуб закрыт в выбранное время/день',
  );
});

test('rejects lessons outside club working hours', async () => {
  const prisma = {
    clubSchedule: {
      findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', dayOfWeekOff: 1 }),
    },
  };
  const service = new LessonsService(prisma, unusedLedger);

  // Tuesday 08:30–09:30 in Europe/Moscow starts before opening.
  await assert.rejects(
    service.validateClubWorkingHours(
      new Date('2026-09-08T05:30:00.000Z'),
      new Date('2026-09-08T06:30:00.000Z'),
    ),
    (error) => error.getStatus() === 400 &&
      error.message === 'Клуб закрыт в выбранное время/день',
  );
});

test('rejects an exact horse daily workload overflow with the required message', async () => {
  const prisma = {
    clubSchedule: {
      findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', dayOfWeekOff: 1 }),
    },
    horse: {
      findUnique: async () => ({ name: 'Буран', maxDailyMinutes: 120 }),
    },
    lesson: {
      findMany: async () => [
        {
          startTime: new Date('2026-09-08T06:00:00.000Z'),
          endTime: new Date('2026-09-08T07:00:00.000Z'),
        },
        {
          startTime: new Date('2026-09-08T08:00:00.000Z'),
          endTime: new Date('2026-09-08T08:45:00.000Z'),
        },
      ],
    },
  };
  const service = new LessonsService(prisma, unusedLedger);

  await assert.rejects(
    service.validateHorseDailyLoad(
      'horse-1',
      new Date('2026-09-08T10:00:00.000Z'),
      30,
    ),
    (error) => error.getStatus() === 409 &&
      error.message ===
        'Превышен суточный лимит нагрузки лошади "Буран": занято 105 из 120 мин.',
  );
});

test('returns horse workload values for the booking progress bar', async () => {
  const prisma = {
    clubSchedule: {
      findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', dayOfWeekOff: 1 }),
    },
    horse: {
      findUnique: async () => ({ name: 'Буран', maxDailyMinutes: 240 }),
    },
    lesson: {
      findMany: async () => [{
        startTime: new Date('2026-09-08T06:00:00.000Z'),
        endTime: new Date('2026-09-08T07:30:00.000Z'),
      }],
    },
  };
  const service = new LessonsService(prisma, unusedLedger);
  assert.deepEqual(await service.getHorseWorkload('horse-1', '2026-09-08'), {
    maxDailyMinutes: 240,
    usedMinutes: 90,
    remainingMinutes: 150,
  });
});

function createStatusHarness(newStatus, operations = [], options = {}) {
  const debitCalls = [];
  const refundCalls = [];
  const bookingUpdates = [];
  const tx = {
    lesson: {
      findUnique: async () => ({
        status: LessonStatus.SCHEDULED,
        service: { allowMembership: options.allowMembership ?? false },
        bookings: [
          { id: 'booking-1', clientId: 'client-1', membershipId: 'membership-2' },
          { id: 'booking-2', clientId: 'client-2', membershipId: 'membership-1' },
          { id: 'booking-3', clientId: 'client-3', membershipId: 'membership-1' },
          { id: 'booking-4', clientId: 'client-4', membershipId: null },
        ],
        operations,
      }),
      update: async ({ data }) => ({ id: 'lesson-1', status: data.status, bookings: [] }),
    },
    membership: {
      findFirst: async () => options.automaticMembershipId ? { id: options.automaticMembershipId } : null,
    },
    booking: {
      update: async (args) => { bookingUpdates.push(args); return args.data; },
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const ledger = {
    debitLesson: async (...args) => debitCalls.push(args),
    refundLesson: async (...args) => refundCalls.push(args),
  };
  const service = new LessonsService(prisma, ledger);
  return service.updateLessonStatus('lesson-1', newStatus).then((result) => ({
    result, debitCalls, refundCalls, bookingUpdates, tx,
  }));
}

test('COMPLETED and NO_SHOW debit every distinct linked membership', async () => {
  for (const status of [LessonStatus.COMPLETED, LessonStatus.NO_SHOW]) {
    const { result, debitCalls, refundCalls, tx } = await createStatusHarness(status);
    assert.equal(result.status, status);
    assert.equal(debitCalls.length, 2);
    assert.deepEqual(debitCalls.map((call) => call[0]), [
      'membership-1', 'membership-2',
    ]);
    assert.ok(debitCalls.every((call) => call[1] === 'lesson-1' && call[3] === tx));
    assert.equal(refundCalls.length, 0);
  }
});

test('COMPLETED automatically links and debits an active client membership', async () => {
  const { debitCalls, bookingUpdates } = await createStatusHarness(
    LessonStatus.COMPLETED,
    [],
    { allowMembership: true, automaticMembershipId: 'membership-3' },
  );
  assert.deepEqual(bookingUpdates, [{
    where: { id: 'booking-4' },
    data: { membershipId: 'membership-3' },
  }]);
  assert.deepEqual(debitCalls.map((call) => call[0]), [
    'membership-1', 'membership-2', 'membership-3',
  ]);
});

test('CANCELLED refunds only memberships with DEBIT and without REFUND', async () => {
  const operations = [
    { membershipId: 'membership-1', type: MembershipOpType.DEBIT },
    { membershipId: 'membership-2', type: MembershipOpType.DEBIT },
    { membershipId: 'membership-2', type: MembershipOpType.REFUND },
  ];
  const { result, debitCalls, refundCalls, tx } = await createStatusHarness(
    LessonStatus.CANCELLED,
    operations,
  );
  assert.equal(result.status, LessonStatus.CANCELLED);
  assert.equal(debitCalls.length, 0);
  assert.equal(refundCalls.length, 1);
  assert.equal(refundCalls[0][0], 'membership-1');
  assert.equal(refundCalls[0][1], 'lesson-1');
  assert.equal(refundCalls[0][3], tx);
});
