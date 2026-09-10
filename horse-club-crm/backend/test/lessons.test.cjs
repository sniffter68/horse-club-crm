const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');

const { LessonStatus, MembershipOpType, Prisma } = require('@prisma/client');
const { LessonsService } = require('../dist/lessons/lessons.service');

const scheduled = {
  id: 'lesson-1',
  trainerId: 'trainer-1',
  horseId: 'horse-1',
  status: LessonStatus.SCHEDULED,
  startTime: new Date('2026-09-07T10:00:00.000Z'),
  endTime: new Date('2026-09-07T11:00:00.000Z'),
};

function matchesConflict(lesson, where) {
  const resourceMatches = where.OR.some((condition) =>
    (condition.trainerId && lesson.trainerId === condition.trainerId) ||
    (condition.horseId && lesson.horseId === condition.horseId));
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
        .map(({ trainerId, horseId }) => ({ trainerId, horseId })),
    },
  };
}

const unusedLedger = {};

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

test('create uses service duration and creates the first booking atomically', async () => {
  let createArgs;
  let transactionOptions;
  const tx = {
    clubSchedule: {
      findUnique: async () => ({ openTime: '09:00', closeTime: '21:00', dayOfWeekOff: 1 }),
    },
    horse: {
      findUnique: async () => ({ name: 'Буран', maxDailyMinutes: 240 }),
    },
    service: { findUnique: async () => ({ durationMinutes: 45 }) },
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
    membershipId: 'membership-1',
    startTime: '2026-09-08T10:00:00.000Z',
  });

  assert.equal(createArgs.data.endTime.toISOString(), '2026-09-08T10:45:00.000Z');
  assert.equal(createArgs.data.status, LessonStatus.SCHEDULED);
  assert.deepEqual(createArgs.data.bookings.create, {
    clientId: 'client-1', membershipId: 'membership-1',
  });
  assert.equal(result.id, 'lesson-new');
  assert.deepEqual(transactionOptions, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5000,
    timeout: 10000,
  });
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
    horseId: 'horse-1',
    serviceId: 'service-1',
    startTime: '2026-09-08T10:00:00.000Z',
  });
  assert.equal(attempts, 2);

  await service.findAll({
    from: '2026-09-07T00:00:00.000Z',
    to: '2026-09-08T00:00:00.000Z',
    trainerId: 'trainer-1',
    status: LessonStatus.SCHEDULED,
  });
  assert.deepEqual(listArgs.where, {
    trainerId: 'trainer-1',
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

function createStatusHarness(newStatus, operations = []) {
  const debitCalls = [];
  const refundCalls = [];
  const tx = {
    lesson: {
      findUnique: async () => ({
        status: LessonStatus.SCHEDULED,
        bookings: [
          { membershipId: 'membership-2' },
          { membershipId: 'membership-1' },
          { membershipId: 'membership-1' },
          { membershipId: null },
        ],
        operations,
      }),
      update: async ({ data }) => ({ id: 'lesson-1', status: data.status, bookings: [] }),
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const ledger = {
    debitLesson: async (...args) => debitCalls.push(args),
    refundLesson: async (...args) => refundCalls.push(args),
  };
  const service = new LessonsService(prisma, ledger);
  return service.updateLessonStatus('lesson-1', newStatus).then((result) => ({
    result, debitCalls, refundCalls, tx,
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
