import { isSerializationFailure } from '../common/serialization-failure';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TRANSACTION_RETRIES = 5;

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class MembershipLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Списывает ровно одно занятие и записывает DEBIT в тот же commit.
   * Операция завершится целиком либо полностью откатится.
   */
  async debitLesson(
    membershipId: string,
    lessonId: string,
    reason: string,
    transaction?: TransactionClient,
  ): Promise<void> {
    const normalizedReason = this.validateReason(reason);

    try {
      if (transaction) {
        await this.debitWithinTransaction(
          transaction,
          membershipId,
          lessonId,
          normalizedReason,
          true,
        );
      } else {
        await this.runSerializable(async (tx) => {
          await this.debitWithinTransaction(
            tx,
            membershipId,
            lessonId,
            normalizedReason,
            true,
          );
        });
      }
    } catch (error: unknown) {
      this.rethrowMembershipOpDuplicate(error);
    }
  }

  /**
   * Возвращает ровно одно ранее списанное занятие и записывает REFUND.
   * Без исходного DEBIT возврат запрещён, чтобы баланс нельзя было увеличить
   * произвольным повторным вызовом.
   */
  async refundLesson(
    membershipId: string,
    lessonId: string,
    reason: string,
    transaction?: TransactionClient,
  ): Promise<void> {
    const normalizedReason = this.validateReason(reason);

    try {
      if (transaction) {
        await this.refundWithinTransaction(
          transaction,
          membershipId,
          lessonId,
          normalizedReason,
          true,
        );
      } else {
        await this.runSerializable(async (tx) => {
          await this.refundWithinTransaction(
            tx,
            membershipId,
            lessonId,
            normalizedReason,
            true,
          );
        });
      }
    } catch (error: unknown) {
      this.rethrowMembershipOpDuplicate(error);
    }
  }

  /**
   * attended=true означает состоявшееся посещение. NO_SHOW также является
   * платным исходом. CANCELLED имеет приоритет: при наличии прошлого DEBIT
   * выполняется один REFUND, а без DEBIT баланс не меняется.
   *
   * Повторный вызов с тем же результатом безопасен: журнал проверяется до
   * изменения баланса, поэтому второе списание или возврат не создаётся.
   */
  async markAttendance(bookingId: string, attended: boolean, actor?: { trainerId: string; noShow: boolean }): Promise<void> {
    await this.runSerializable(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          membershipId: true,
          lessonId: true,
          lesson: { select: { status: true, trainerId: true, startTime: true } },
        },
      });
      if (!booking) {
        throw new NotFoundException('Бронирование не найдено');
      }
      if (actor) {
        if (booking.lesson.trainerId !== actor.trainerId) throw new ForbiddenException('Занятие другого тренера');
        if (booking.lesson.status === 'CANCELLED') throw new ConflictException('Занятие отменено');
        if (booking.lesson.startTime > new Date()) throw new ConflictException('Занятие ещё не началось');
      }

      // Во всех путях сначала берём lock абонемента, затем изменяем booking.
      // Единый порядок блокировок снижает риск взаимных блокировок с другими
      // финансовыми сценариями.
      if (booking.membershipId) {
        await this.lockMembership(tx, booking.membershipId);
      }

      // Баланс и бронирование меняются в одной транзакции. Если дальнейшая
      // операция журнала завершится ошибкой, изменение attended откатится.
      await tx.booking.update({
        where: { id: bookingId },
        data: { attended, attendanceStatus: attended ? 'ATTENDED' : actor?.noShow || booking.lesson.status === 'NO_SHOW' ? 'NO_SHOW' : 'PENDING' },
      });

      // Бронирование без абонемента не влияет на membership ledger.
      if (!booking.membershipId) {
        return;
      }

      if (booking.lesson.status === 'CANCELLED') {
        await this.refundWithinTransaction(
          tx,
          booking.membershipId,
          booking.lessonId,
          'Возврат за отменённое занятие',
          false,
          true,
        );
        return;
      }

      if (attended || actor?.noShow || booking.lesson.status === 'NO_SHOW') {
        await this.debitWithinTransaction(
          tx,
          booking.membershipId,
          booking.lessonId,
          attended ? 'Посещение занятия' : 'Неявка на занятие',
          false,
          true,
        );
      }
    });
  }

  private async debitWithinTransaction(
    tx: TransactionClient,
    membershipId: string,
    lessonId: string,
    reason: string,
    throwOnDuplicate: boolean,
    lockAlreadyHeld = false,
  ): Promise<void> {
    // Транзакционная advisory-lock сериализует все изменения одного абонемента.
    // Она не зависит от физического имени таблицы или Prisma @@map/@map.
    if (!lockAlreadyHeld) {
      await this.lockMembership(tx, membershipId);
    }

    const priorDebit = await tx.membershipOp.findFirst({
      where: { membershipId, lessonId, type: 'DEBIT' },
      select: { id: true },
    });
    if (priorDebit) {
      if (throwOnDuplicate) {
        throw new ConflictException('Занятие уже списано с абонемента');
      }
      return;
    }

    const membership = await tx.membership.findUnique({
      where: { id: membershipId },
      select: { remainedLessons: true, validUntil: true },
    });
    if (!membership) {
      throw new NotFoundException('Абонемент не найден');
    }

    const now = await this.databaseNow(tx);
    if (membership.remainedLessons <= 0) {
      throw new ConflictException('На абонементе не осталось занятий');
    }
    if (membership.validUntil < now) {
      throw new ConflictException('Срок действия абонемента истёк');
    }

    // Условный UPDATE дублирует проверки непосредственно в write-запросе.
    // Это дополнительная защита от кода, который изменяет баланс вне сервиса.
    const update = await tx.membership.updateMany({
      where: {
        id: membershipId,
        remainedLessons: { gt: 0 },
        validUntil: { gte: now },
      },
      data: { remainedLessons: { decrement: 1 } },
    });
    if (update.count !== 1) {
      throw new ConflictException('Абонемент недоступен для списания');
    }

    await tx.membershipOp.create({
      data: {
        membershipId,
        lessonId,
        type: 'DEBIT',
        amount: 1,
        reason,
      },
    });
  }

  private async refundWithinTransaction(
    tx: TransactionClient,
    membershipId: string,
    lessonId: string,
    reason: string,
    throwOnDuplicate: boolean,
    lockAlreadyHeld = false,
  ): Promise<void> {
    if (!lockAlreadyHeld) {
      await this.lockMembership(tx, membershipId);
    }

    const membership = await tx.membership.findUnique({
      where: { id: membershipId },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('Абонемент не найден');
    }

    const priorDebit = await tx.membershipOp.findFirst({
      where: { membershipId, lessonId, type: 'DEBIT' },
      select: { id: true },
    });
    if (!priorDebit) {
      if (throwOnDuplicate) {
        throw new ConflictException(
          'Нельзя вернуть занятие без предыдущего списания',
        );
      }
      return;
    }

    const priorRefund = await tx.membershipOp.findFirst({
      where: { membershipId, lessonId, type: 'REFUND' },
      select: { id: true },
    });
    if (priorRefund) {
      if (throwOnDuplicate) {
        throw new ConflictException('Занятие уже возвращено на абонемент');
      }
      return;
    }

    await tx.membership.update({
      where: { id: membershipId },
      data: { remainedLessons: { increment: 1 } },
    });
    await tx.membershipOp.create({
      data: {
        membershipId,
        lessonId,
        type: 'REFUND',
        amount: 1,
        reason,
      },
    });
  }

  private async lockMembership(
    tx: TransactionClient,
    membershipId: string,
  ): Promise<void> {
    // PostgreSQL hashtextextended даёт стабильный bigint-ключ. Возможная
    // коллизия лишь сериализует два разных абонемента и не нарушает данные.
    await tx.$queryRaw<Array<{ lock: null }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${membershipId}, 0))::text AS lock
    `;
  }

  private async databaseNow(tx: TransactionClient): Promise<Date> {
    // Используем часы PostgreSQL, чтобы срок действия не зависел от расхождения
    // времени между приложением и сервером базы данных.
    const rows = await tx.$queryRaw<Array<{ now: Date }>>`
      SELECT CURRENT_TIMESTAMP AS now
    `;
    const now = rows[0]?.now;
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new InternalServerErrorException('Не удалось получить время базы данных');
    }
    return now;
  }

  private async runSerializable<T>(
    operation: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= TRANSACTION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        });
      } catch (error: unknown) {
        if (this.isSerializationFailure(error) && attempt < TRANSACTION_RETRIES) {
          continue;
        }
        throw error;
      }
    }
    throw new InternalServerErrorException('Транзакция не была выполнена');
  }

  private isSerializationFailure(error: unknown): boolean {
    return (
      isSerializationFailure(error)
    );
  }

  /**
   * P2002 может возникнуть, даже если предварительный findFirst не нашёл дубль:
   * ограничение БД остаётся последней линией защиты при конкурентной вставке.
   * Такая ошибка является ожидаемым бизнес-конфликтом, а не внутренней ошибкой 500.
   */
  private rethrowMembershipOpDuplicate(error: unknown): never {
    if (this.isMembershipOpCompositeUniqueViolation(error)) {
      throw new ConflictException(
        'Операция данного типа для этого занятия уже зафиксирована в абонементе',
      );
    }
    throw error;
  }

  private isMembershipOpCompositeUniqueViolation(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;
    const fields = ['membershipId', 'lessonId', 'type'] as const;

    // PostgreSQL обычно возвращает target как массив полей. Строковый вариант
    // поддержан для версий/адаптеров, возвращающих имя unique constraint.
    if (Array.isArray(target)) {
      return (
        target.length === fields.length &&
        fields.every((field) => target.includes(field))
      );
    }
    return (
      typeof target === 'string' &&
      fields.every((field) => target.includes(field))
    );
  }

  private validateReason(reason: string): string {
    const normalized = reason.trim();
    if (normalized.length === 0) {
      throw new BadRequestException('Причина операции обязательна');
    }
    return normalized;
  }
}
