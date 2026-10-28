import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

// Trigger failures contain SQL and row data. Expose only the known business
// message; leave unrelated database failures to the standard exception handler.
const messages = [
  'Финансовый месяц закрыт. Изменение проводок запрещено',
  'Проведенное занятие можно только отменить',
  'У абонемента не указана стоимость для признания выручки',
  'Финансовые проводки и закрытия неизменяемы',
];

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class FinancialPeriodFilter extends BaseExceptionFilter {
  catch(error: Error, host: ArgumentsHost) {
    const message = messages.find(value => error.message.includes(value));
    if (!message) return super.catch(error, host);
    host.switchToHttp().getResponse().status(409).json({ statusCode: 409, error: 'Conflict', message });
  }
}
