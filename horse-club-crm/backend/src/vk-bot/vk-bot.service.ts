import { BadRequestException, ForbiddenException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { Keyboard, VK, type KeyboardBuilder } from 'vk-io';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipLedgerService } from '../memberships/membership-ledger.service';
import { LeadsService } from '../leads/leads.service';
import { normalizePhone, VkLinkService } from './vk-link.service';

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
const menu = (trainer: boolean) => Keyboard.keyboard(trainer
  ? [Keyboard.textButton({ label: 'Расписание на сегодня', payload: { command: 'today' } })]
  : [Keyboard.textButton({ label: 'Баланс абонемента', payload: { command: 'balance' } }), Keyboard.textButton({ label: 'Мои тренировки', payload: { command: 'bookings' } })]);
const welcome = Keyboard.keyboard([Keyboard.textButton({ label: 'Привязать профиль' }), Keyboard.textButton({ label: 'Первичная заявка' })]);
const zone = () => process.env.CLUB_TIME_ZONE || 'Europe/Moscow';
const date = (value: Date) => DateTime.fromJSDate(value, { zone: zone() }).setLocale('ru').toFormat('dd.MM.yyyy HH:mm');

@Injectable()
export class VkBotService {
  private readonly vk: VK | undefined;
  constructor(private readonly prisma: PrismaService, private readonly links: VkLinkService,
    private readonly ledger: MembershipLedgerService, private readonly leads: LeadsService) {
    const token = process.env.VK_BOT_TOKEN?.trim();
    if (token) this.vk = new VK({ token, apiTimeout: 5000, apiRetryLimit: 0 });
  }
  private async send(peer: number, event: string, text: string, keyboard?: KeyboardBuilder) {
    if (!this.vk) throw new ServiceUnavailableException('VK-бот не настроен');
    try {
      await this.vk.api.messages.send({ peer_id: peer, message: text, keyboard,
        random_id: createHash('sha256').update(`${process.env.VK_GROUP_ID}:${event}:${peer}`).digest().readInt32BE(0) || 1 });
    } catch { throw new ServiceUnavailableException('Не удалось отправить ответ VK'); }
  }
  async handleMessage(object: unknown, eventId: unknown): Promise<void> {
    if (!record(object) || !record(object.message)) throw new BadRequestException('Некорректное сообщение VK');
    const { from_id: sender, peer_id: peer, text, out, payload } = object.message;
    if (typeof sender !== 'number' || !Number.isSafeInteger(sender) || typeof peer !== 'number' || !Number.isSafeInteger(peer)
      || typeof text !== 'string' || typeof eventId !== 'string' || !eventId || eventId.length > 200) throw new BadRequestException('Некорректное сообщение VK');
    if (sender <= 0 || peer !== sender || out === 1) return;
    let command = text.trim().toLowerCase();
    let offset = 0;
    if (typeof payload === 'string') {
      try {
        const parsed: unknown = JSON.parse(payload);
        if (record(parsed)) {
          if (typeof parsed.command === 'string') command = parsed.command;
          if (Number.isSafeInteger(parsed.offset) && typeof parsed.offset === 'number' && parsed.offset >= 0 && parsed.offset <= 10000) offset = parsed.offset;
        }
      } catch { /* Ordinary text routes without a payload. */ }
    }
    try {
      const binding = /^привязать\s+(.+?)\s+([a-f0-9]{32})$/i.exec(text.trim());
      if (binding) {
        const kind = await this.links.bind(sender, binding[1], binding[2]);
        await this.send(peer, eventId, 'Профиль успешно привязан', menu(kind === 'TRAINER')); return;
      }
      const [client, trainer] = await Promise.all([
        this.prisma.client.findUnique({ where: { vkUserId: BigInt(sender) } }), this.prisma.trainer.findUnique({ where: { vkUserId: BigInt(sender) } }),
      ]);
      if (!client && !trainer) {
        const lead = /^заявка\s+([^;]{1,100});\s*(.+)$/i.exec(text.trim());
        if (lead) {
          if (!lead[1].trim()) throw new BadRequestException('Укажите имя');
          await this.leads.create({ firstName: lead[1].trim(), phone: normalizePhone(lead[2]) });
          await this.send(peer, eventId, 'Заявка принята. Администратор свяжется с вами и выдаст код привязки.', welcome); return;
        }
        await this.send(peer, eventId, command === 'первичная заявка' ? 'Отправьте: заявка Имя; +79991234567'
          : 'Здравствуйте! Получите у администратора код и отправьте: привязать +79991234567 КОД. Если вы ещё не записаны в клуб, выберите «Первичная заявка».', welcome);
        return;
      }
      if (trainer && ['today', 'расписание на сегодня'].includes(command)) { await this.today(trainer.id, peer, eventId, offset); return; }
      if (client && ['balance', 'баланс абонемента'].includes(command)) {
        const rows = await this.prisma.membership.findMany({ where: { clientId: client.id, validUntil: { gte: new Date() }, remainedLessons: { gt: 0 } }, orderBy: [{ validUntil: 'asc' }, { id: 'asc' }], skip: offset, take: 11 });
        await this.send(peer, eventId, rows.length ? rows.slice(0, 10).map(row => `Абонемент ${row.id}: ${row.remainedLessons} занятий, до ${date(row.validUntil)}`).join('\n') : 'Активных абонементов нет.', rows.length > 10 ? this.next('balance', offset) : menu(false)); return;
      }
      if (client && ['bookings', 'мои тренировки'].includes(command)) {
        const rows = await this.prisma.booking.findMany({ where: { clientId: client.id, lesson: { status: 'SCHEDULED', startTime: { gte: new Date() } } },
          include: { lesson: { include: { trainer: true, horse: true } } }, orderBy: [{ lesson: { startTime: 'asc' } }, { id: 'asc' }], skip: offset, take: 11 });
        await this.send(peer, eventId, rows.length ? rows.slice(0, 10).map(row => `${date(row.lesson.startTime)} — ${row.lesson.trainer.name}, лошадь ${row.lesson.horse.name}`).join('\n') : 'Предстоящих тренировок нет.', rows.length > 10 ? this.next('bookings', offset) : menu(false)); return;
      }
      await this.send(peer, eventId, `Здравствуйте, ${trainer?.name || client?.firstName || 'всадник'}! Выберите действие. Время: ${zone()}.`, menu(Boolean(trainer)));
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) { await this.send(peer, `${eventId}:error`, error.message); return; }
      throw error;
    }
  }
  private next(command: string, offset: number) { return Keyboard.keyboard([Keyboard.textButton({ label: 'Далее', payload: { command, offset: offset + 10 } })]); }
  private async today(trainerId: string, peer: number, event: string, offset: number) {
    const start = DateTime.now().setZone(zone()).startOf('day');
    if (!start.isValid) throw new ServiceUnavailableException('Неверный часовой пояс клуба');
    const rows = await this.prisma.lesson.findMany({ where: { trainerId, status: { not: 'CANCELLED' }, startTime: { gte: start.toJSDate(), lt: start.plus({ days: 1 }).toJSDate() } },
      include: { horse: true, bookings: { include: { client: true }, orderBy: { id: 'asc' } } }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }], skip: offset, take: 11 });
    if (!rows.length) { await this.send(peer, event, 'На сегодня занятий нет.', menu(true)); return; }
    for (const lesson of rows.slice(0, 10)) {
      if (!lesson.bookings.length) await this.send(peer, `${event}:${lesson.id}`, `${date(lesson.startTime)} — лошадь ${lesson.horse.name}. Участников пока нет.`);
      for (const row of lesson.bookings) {
      await this.send(peer, `${event}:${row.id}`, `${date(lesson.startTime)} — ${row.client.name}, лошадь ${lesson.horse.name}\nОтметка: ${row.attendanceStatus}`,
        Keyboard.keyboard([
          Keyboard.callbackButton({ label: '✅ Присутствовал', payload: { action: 'attendance', bookingId: row.id, attended: true } }),
          Keyboard.callbackButton({ label: '❌ Неявка', payload: { action: 'attendance', bookingId: row.id, attended: false } }),
        ]).inline());
      }
    }
    if (rows.length > 10) await this.send(peer, `${event}:next`, 'Есть ещё бронирования', this.next('today', offset));
  }
  async handleEvent(object: unknown): Promise<void> {
    if (!record(object) || typeof object.user_id !== 'number' || !Number.isSafeInteger(object.user_id) || object.user_id <= 0
      || object.peer_id !== object.user_id || typeof object.event_id !== 'string' || !object.event_id || !record(object.payload)) throw new BadRequestException('Некорректное нажатие VK');
    const { bookingId, attended, action } = object.payload;
    if (action !== 'attendance' || typeof bookingId !== 'string' || !isUUID(bookingId) || typeof attended !== 'boolean') throw new BadRequestException('Неизвестная команда');
    let answer = 'Посещение отмечено';
    try {
      const trainer = await this.prisma.trainer.findUnique({ where: { vkUserId: BigInt(object.user_id) } });
      if (!trainer) throw new ForbiddenException('Действие доступно только тренеру');
      await this.ledger.markAttendance(bookingId, attended, { trainerId: trainer.id, noShow: !attended });
      if (!attended) answer = 'Неявка отмечена';
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) answer = error.message;
      else throw error;
    }
    if (!this.vk) throw new ServiceUnavailableException('VK-бот не настроен');
    try {
      await this.vk.api.messages.sendMessageEventAnswer({ event_id: object.event_id, user_id: object.user_id, peer_id: object.user_id,
        event_data: JSON.stringify({ type: 'show_snackbar', text: answer.slice(0, 90) }) });
    } catch { throw new ServiceUnavailableException('Не удалось подтвердить действие VK'); }
  }
}
