import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { Keyboard, VK, type KeyboardBuilder } from 'vk-io';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipLedgerService } from '../memberships/membership-ledger.service';
import { LeadsService } from '../leads/leads.service';
import { normalizePhone, VkLinkService } from './vk-link.service';
import { mainMenu as menu, normalizeVkCommand, welcomeMenu } from './vk-bot.keyboard';
import { clubCard, riderGuide } from './vk-bot.config';
import { queueVkAdminChatNotification } from './vk-delivery.module';
import { currentLeadConsentVersion as consentVersion } from '../common/lead-consent';

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
const welcome = welcomeMenu();
const zone = () => process.env.CLUB_TIME_ZONE || 'Europe/Moscow';
const consentUrl = () => `${(process.env.PUBLIC_LANDING_URL || '').replace(/\/$/, '')}/#consent`;
const date = (value: Date) => DateTime.fromJSDate(value, { zone: zone() }).setLocale('ru').toFormat('dd.MM.yyyy HH:mm');
const expiryDate = (value: Date) => DateTime.fromJSDate(value, { zone: zone() }).setLocale('ru').toFormat('dd.MM.yyyy');
const trainingDate = (value: Date) => DateTime.fromJSDate(value, { zone: zone() }).setLocale('ru').toFormat("d MMMM (ccc) 'в' HH:mm");
const lessonPlural = new Intl.PluralRules('ru');
const lessonsLeft = (count: number) => {
  const plural = lessonPlural.select(count);
  return `осталось ${count} ${plural === 'one' ? 'занятие' : plural === 'few' ? 'занятия' : 'занятий'}`;
};

@Injectable()
export class VkBotService {
  private readonly logger = new Logger(VkBotService.name);
  private readonly vk: VK | undefined;
  private readonly firstNames = new Map<number, { value: Promise<string | undefined>; expiresAt: number }>();
  constructor(private readonly prisma: PrismaService, private readonly links: VkLinkService,
    private readonly ledger: MembershipLedgerService, private readonly leads: LeadsService) {
    const token = process.env.VK_COMMUNITY_TOKEN?.trim() || process.env.VK_BOT_TOKEN?.trim();
    if (token) this.vk = new VK({ token, apiVersion: '5.199', apiTimeout: 5000, apiRetryLimit: 0 });
  }
  private getFirstName(sender: number): Promise<string | undefined> {
    const cached = this.firstNames.get(sender);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    // Bound memory usage and share in-flight lookups for repeated callbacks.
    this.firstNames.delete(sender);
    if (this.firstNames.size >= 1000) this.firstNames.delete(this.firstNames.keys().next().value!);
    const value = (async () => {
      try {
        // users.get includes first_name and last_name in its default response.
        const profiles = await this.vk?.api.users.get({ user_ids: [sender] });
        const firstName = profiles?.[0]?.first_name;
        return typeof firstName === 'string' ? firstName.trim() || undefined : undefined;
      } catch {
        this.logger.warn('Не удалось получить имя пользователя VK');
        return undefined;
      }
    })();
    this.firstNames.set(sender, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
    return value;
  }
  private async send(peer: number, event: string, text: string, keyboard?: KeyboardBuilder) {
    if (!this.vk) throw new ServiceUnavailableException('VK-бот не настроен');
    try {
      await this.vk.api.messages.send({ peer_id: peer, message: text, keyboard,
        random_id: createHash('sha256').update(`${process.env.VK_GROUP_ID}:${event}:${peer}`).digest().readInt32BE(0) || 1 });
    } catch { throw new ServiceUnavailableException('Не удалось отправить ответ VK'); }
  }
  private async requestAdministrator(clientPeerId: number, eventId: string): Promise<void> {
    const requestedAt = new Date();
    this.logger.log({ event: 'vk_help_requested', vkUserId: clientPeerId, eventId, requestedAt: requestedAt.toISOString() });
    let keyboard = welcome;
    let name = 'Гость';
    try {
      const [client, trainer] = await Promise.all([
        this.prisma.client.findUnique({ where: { vkUserId: BigInt(clientPeerId) } }),
        this.prisma.trainer.findUnique({ where: { vkUserId: BigInt(clientPeerId) } }),
      ]);
      name = client?.name || trainer?.name || name;
      if (client || trainer) keyboard = menu(Boolean(trainer));
    } catch { this.logger.warn('Не удалось загрузить профиль для запроса помощи VK'); }
    const adminPeerId = Number(process.env.VK_ADMIN_PEER_ID);
    const configuredGroupId = process.env.VK_GROUP_ID?.trim() || '';
    const groupId = /^-?\d+$/.test(configuredGroupId) ? Math.abs(Number(configuredGroupId)) : 0;
    const profileUrl = `https://vk.com/id${clientPeerId}`;
    const dialogUrl = Number.isSafeInteger(groupId) && groupId > 0
      ? `https://vk.com/gim${groupId}?sel=${clientPeerId}` : profileUrl;
    if (Number.isSafeInteger(adminPeerId) && adminPeerId > 0 && adminPeerId !== clientPeerId) {
      try {
        await this.prisma.$transaction(tx => queueVkAdminChatNotification(tx,
          `help:${clientPeerId}:${createHash('sha256').update(eventId).digest('hex')}`,
          `💬 Запрос помощи администратору клуба\nКлиент: ${name}\nПрофиль: ${profileUrl}\n👉 Открыть диалог: ${dialogUrl}\nВремя: ${date(requestedAt)}`));
      } catch { this.logger.error({ event: 'vk_help_not_queued', vkUserId: clientPeerId, eventId }); }
    } else {
      this.logger.warn({ event: 'vk_help_not_queued', vkUserId: clientPeerId, eventId,
        reason: adminPeerId === clientPeerId ? 'same_peer' : 'admin_peer_not_configured' });
    }
    await this.send(clientPeerId, eventId,
      '💬 Мы передали ваш запрос администратору клуба!\nСпециалист свяжется с вами в этом диалоге в ближайшее время. 🐎', keyboard);
  }
  async handleMessage(object: unknown, eventId: unknown): Promise<void> {
    if (!record(object) || !record(object.message)) throw new BadRequestException('Некорректное сообщение VK');
    const { from_id: sender, peer_id: peer, text, out, payload } = object.message;
    if (eventId === undefined) {
      const id = object.message.id ?? object.message.conversation_message_id;
      eventId = typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? `message:${peer}:${id}` : randomUUID();
    }
    if (typeof sender !== 'number' || !Number.isSafeInteger(sender) || typeof peer !== 'number' || !Number.isSafeInteger(peer)
      || typeof text !== 'string' || typeof eventId !== 'string' || !eventId || eventId.length > 200) throw new BadRequestException('Некорректное сообщение VK');
    if (sender <= 0 || peer !== sender || out === 1) return;
    let command = normalizeVkCommand(text);
    let offset = 0;
    if (typeof payload === 'string') {
      try {
        const parsed: unknown = JSON.parse(payload);
        if (record(parsed)) {
          if (typeof parsed.command === 'string') command = normalizeVkCommand(parsed.command);
          if (Number.isSafeInteger(parsed.offset) && typeof parsed.offset === 'number' && parsed.offset >= 0 && parsed.offset <= 10000) offset = parsed.offset;
        }
      } catch { /* Ordinary text routes without a payload. */ }
    }
    // Leave ordinary community messages for the live administrator conversation.
    const textCommand = /^(?:заявка|согласен|привязать|\/start)(?:\s|$)/i.test(text.trim());
    const menuCommand = ['начать', 'help', 'about', 'guide', 'первичная заявка', 'привязать профиль',
      'today', 'расписание на сегодня', 'balance', 'мой баланс', 'баланс абонемента',
      'bookings', 'мои тренировки'].includes(command);
    if (!textCommand && !menuCommand) return;
    if (command === 'начать') {
      const firstName = await this.getFirstName(sender);
      await this.send(peer, eventId, `Здравствуйте${firstName ? `, ${firstName}` : ''}! Вы подключены к боту конного клуба. Здесь будут приходить напоминания о тренировках и статус бронирований.`, welcome);
      return;
    }
    if (command === 'help') { await this.requestAdministrator(peer, eventId); return; }
    try {
      const consent = /^согласен\s+([a-zA-Z0-9._-]{1,64})$/i.exec(text.trim());
      if (consent) {
        if (consent[1] !== consentVersion()) throw new BadRequestException('Редакция согласия изменилась. Запросите актуальную ссылку командой «Первичная заявка»');
        const consentedAt = new Date();
        await this.prisma.vkConsent.upsert({
          where: { vkUserId: BigInt(sender) },
          update: { consentVersion: consentVersion(), consentedAt },
          create: { vkUserId: BigInt(sender), consentVersion: consentVersion(), consentedAt },
        });
        await this.send(peer, eventId, 'Согласие принято. Теперь отправьте: заявка Имя; +79991234567', welcome); return;
      }
      const shortCode = /^\/start\s+(\d{4})$/i.exec(text.trim());
      if (shortCode) {
        await this.send(peer, eventId, `Для подтверждения телефона отправьте: привязать ВАШ_ТЕЛЕФОН ${shortCode[1]}. Код действует 5 минут.`, welcome); return;
      }
      const binding = /^(?:привязать|\/start)\s+(.+?)\s+(\d{4}|[a-f0-9]{32})$/i.exec(text.trim());
      if (binding) {
        const kind = await this.links.bind(sender, binding[1], binding[2]);
        const profile = kind === 'TRAINER' ? await this.prisma.trainer.findUnique({ where: { vkUserId: BigInt(sender) } })
          : await this.prisma.client.findUnique({ where: { vkUserId: BigInt(sender) } });
        await this.send(peer, eventId, `Профиль успешно привязан. Здравствуйте, ${profile?.name || (profile && 'firstName' in profile ? profile.firstName : '') || 'всадник'}! Ваша роль: ${kind === 'TRAINER' ? 'тренер' : 'клиент'}.`, menu(kind === 'TRAINER')); return;
      }
      const [client, trainer] = await Promise.all([
        this.prisma.client.findUnique({ where: { vkUserId: BigInt(sender) } }), this.prisma.trainer.findUnique({ where: { vkUserId: BigInt(sender) } }),
      ]);
      const keyboard = client || trainer ? menu(Boolean(trainer)) : welcome;
      if (command === 'about') { await this.send(peer, eventId, clubCard(), keyboard); return; }
      if (command === 'guide') { await this.send(peer, eventId, riderGuide(), keyboard); return; }
      if (!client && !trainer) {
        const lead = /^заявка\s+([^;]{1,100});\s*(.+)$/i.exec(text.trim());
        if (lead) {
          const accepted = await this.prisma.vkConsent.findUnique({ where: { vkUserId: BigInt(sender) } });
          if (!accepted || accepted.consentVersion !== consentVersion()) {
            await this.send(peer, eventId, `Сначала ознакомьтесь с согласием: ${consentUrl()}\nЗатем отдельным сообщением отправьте: согласен ${consentVersion()}`, welcome); return;
          }
          if (!lead[1].trim()) throw new BadRequestException('Укажите имя');
          await this.leads.create({ consentAccepted: true, consentVersion: accepted.consentVersion, firstName: lead[1].trim(), phone: normalizePhone(lead[2]) }, 'VK');
          await this.send(peer, eventId, 'Заявка принята. Администратор свяжется с вами и выдаст код привязки.', welcome); return;
        }
        await this.send(peer, eventId, command === 'первичная заявка' ? `Ознакомьтесь с согласием: ${consentUrl()}\nЗатем отдельным сообщением отправьте: согласен ${consentVersion()}`
          : 'Здравствуйте! Получите у администратора код и отправьте: привязать +79991234567 КОД. Если вы ещё не записаны в клуб, выберите «Первичная заявка».', welcome);
        return;
      }
      if (trainer && ['today', 'расписание на сегодня'].includes(command)) { await this.today(trainer.id, peer, eventId, offset); return; }
      if (client && ['balance', 'мой баланс', 'баланс абонемента'].includes(command)) {
        const rows = await this.prisma.membership.findMany({ where: { clientId: client.id, validUntil: { gte: new Date() }, remainedLessons: { gt: 0 } },
          include: { pricingPlan: { select: { name: true } } }, orderBy: [{ validUntil: 'asc' }, { id: 'asc' }], skip: offset, take: 11 });
        const lines = rows.slice(0, 10).map(row => {
          const title = row.title?.trim() || row.pricingPlan?.name.trim() || 'Абонемент';
          return `• «${title}»: ${lessonsLeft(row.remainedLessons)} (до ${expiryDate(row.validUntil)})`;
        });
        await this.send(peer, eventId, lines.length ? `💳 Ваши абонементы:\n${lines.join('\n')}` : 'У вас пока нет активных абонементов.', rows.length > 10 ? this.next('balance', offset) : menu(false)); return;
      }
      if (client && ['bookings', 'мои тренировки'].includes(command)) {
        const rows = await this.prisma.booking.findMany({ where: { clientId: client.id, lesson: { status: 'SCHEDULED', startTime: { gte: new Date() } } },
          include: { horse: true, lesson: { include: { trainer: true, arena: true } } }, orderBy: [{ lesson: { startTime: 'asc' } }, { id: 'asc' }], skip: offset, take: 11 });
        const cards = rows.slice(0, 10).filter(row => row.lesson !== null).map(row => {
          const lesson = row.lesson!;
          return [`• ${trainingDate(lesson.startTime)}`,
            `  Лошадь: ${row.horse?.name.trim() || 'пока не назначена'}`,
            `  Тренер: ${lesson.trainer.name.trim() || 'пока не назначен'}`,
            ...(lesson.arena?.name.trim() ? [`  Манеж: ${lesson.arena.name.trim()}`] : []),
          ].join('\n');
        });
        await this.send(peer, eventId, cards.length ? `📅 Предстоящие тренировки:\n${cards.join('\n\n')}` : 'Предстоящих тренировок пока нет.', rows.length > 10 ? this.next('bookings', offset) : menu(false)); return;
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
      include: { bookings: { include: { client: true, horse: true }, orderBy: { id: 'asc' } } }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }], skip: offset, take: 11 });
    if (!rows.length) { await this.send(peer, event, 'На сегодня занятий нет.', menu(true)); return; }
    for (const lesson of rows.slice(0, 10)) {
      if (!lesson.bookings.length) await this.send(peer, `${event}:${lesson.id}`, `${date(lesson.startTime)} — Участников пока нет.`);
      for (const row of lesson.bookings) {
      await this.send(peer, `${event}:${row.id}`, `${date(lesson.startTime)} — ${row.client.name}${row.horse ? `, лошадь ${row.horse.name}` : ''}\nОтметка: ${row.attendanceStatus}`,
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
