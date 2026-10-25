import { VkIdentityService } from './vk-identity.service';
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
import { clubCard, clubDirections, riderGuide, vkGroupToken } from './vk-bot.config';
import { queueVkAdminChatNotification } from './vk-delivery.module';
import { currentLeadConsentVersion as consentVersion } from '../common/lead-consent';
import { membershipAccessWhere } from '../memberships/membership-access';
import { splitVkText } from './vk-message-text';

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
const welcome = welcomeMenu();
const zone = () => 'Europe/Moscow';
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
    private readonly ledger: MembershipLedgerService, private readonly leads: LeadsService,
    private readonly identity: VkIdentityService = new VkIdentityService(prisma)) {
    const token = vkGroupToken();
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
      const chunks = splitVkText(text);
      for (const [index, message] of chunks.entries()) {
        const key = chunks.length > 1 ? `${event}:part:${index}` : event;
        await this.vk.api.messages.send({ peer_id: peer, message, keyboard: index === chunks.length - 1 ? keyboard : undefined,
          random_id: createHash('sha256').update(`${process.env.VK_GROUP_ID}:${key}:${peer}`).digest().readInt32BE(0) || 1 });
      }
    } catch { throw new ServiceUnavailableException('Не удалось отправить ответ VK'); }
  }
  private async requestAdministrator(clientPeerId: number, eventId: string): Promise<void> {
    const requestedAt = new Date();
    this.logger.log({ event: 'vk_help_requested', vkUserId: clientPeerId, eventId, requestedAt: requestedAt.toISOString() });
    let keyboard = welcome;
    let name = 'Гость';
    try {
      const identity = await this.identity.identify(String(clientPeerId));
      if (identity.type !== 'UNKNOWN') {
        name = identity.name || name;
        keyboard = menu(identity.type === 'STAFF');
      }
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
    if (command === 'help') { await this.requestAdministrator(peer, eventId); return; }
    try {
      // Shared with GET /vk/identify; embedded webhook avoids a loopback HTTP request.
      const identity = await this.identity.identify(String(sender));
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
      const client = identity.type === 'CLIENT' ? { id: identity.clientId, firstName: identity.name } : null;
      const staff = identity.type === 'STAFF' ? identity : null;
      const trainer = staff?.role === 'TRAINER' && staff.trainerId ? { id: staff.trainerId, name: staff.name } : null;
      const keyboard = staff || client ? menu(Boolean(staff)) : welcome;
      if (command === 'начать' && !client && !staff) {
        const firstName = await this.getFirstName(sender);
        await this.send(peer, eventId, `Здравствуйте${firstName ? `, ${firstName}` : ''}! Приглашаем вас в конный клуб.\nЕсли вы уже наш клиент, попросите администратора привязать ваш VK к профилю в CRM.\n${clubCard()}`, welcome);
        return;
      }
      if (command === 'about') { await this.send(peer, eventId, clubCard(), keyboard); return; }
      if (command === 'directions') { await this.send(peer, eventId, clubDirections(), keyboard); return; }
      if (command === 'prices') {
        const services = await this.prisma.service.findMany({ where: { isPublic: true }, skip: offset, take: 11, orderBy: [{ order: 'asc' }, { title: 'asc' }, { id: 'asc' }],
          select: { name: true, title: true, durationMinutes: true, price: true } });
        const lines = services.slice(0, 10).map(service => {
          const name = service.title.trim() || service.name.trim();
          return `• ${name}: ${Number(service.price).toLocaleString('ru-RU')} ₽, ${service.durationMinutes} мин.`;
        });
        await this.send(peer, eventId, lines.length ? `🐎 Услуги и цены:\n${lines.join('\n')}` : 'Актуальные услуги и цены уточните у администратора клуба.', services.length > 10 ? this.next('prices', offset) : keyboard);
        return;
      }
      if (command === 'guide') { await this.send(peer, eventId, riderGuide(), keyboard); return; }
      if (!client && !staff) {
        const lead = /^заявка\s+([^;]{1,100});\s*(.+)$/i.exec(text.trim());
        if (lead) {
          const accepted = await this.prisma.vkConsent.findUnique({ where: { vkUserId: BigInt(sender) } });
          if (!accepted || accepted.consentVersion !== consentVersion()) {
            await this.send(peer, eventId, `Сначала ознакомьтесь с согласием: ${consentUrl()}\nЗатем отдельным сообщением отправьте: согласен ${consentVersion()}`, welcome); return;
          }
          if (!lead[1].trim()) throw new BadRequestException('Укажите имя');
          await this.leads.create({ consentAccepted: true, consentVersion: accepted.consentVersion, firstName: lead[1].trim(), phone: normalizePhone(lead[2]) }, 'VK');
          await this.send(peer, eventId, 'Заявка принята. Администратор свяжется с вами и привяжет ваш VK ID в CRM.', welcome); return;
        }
        await this.send(peer, eventId, command === 'первичная заявка' ? `Ознакомьтесь с согласием: ${consentUrl()}\nЗатем отдельным сообщением отправьте: согласен ${consentVersion()}`
          : `Здравствуйте! Приглашаем вас в конный клуб.\nЕсли вы уже наш клиент, попросите администратора привязать ваш VK к профилю в CRM.\n${clubCard()}`, welcome);
        return;
      }
      if (trainer && command === 'today') { await this.today(trainer.id, peer, eventId, offset); return; }
      if (trainer && command === 'riders') { await this.today(trainer.id, peer, eventId, offset, true); return; }
      if (staff && !trainer && ['today', 'riders'].includes(command)) {
        await this.send(peer, eventId, 'К вашей учетной записи не привязан профиль тренера. Обратитесь к администратору клуба.', keyboard); return;
      }
      if (client && command === 'book') { await this.requestAdministrator(peer, eventId); return; }
      if (identity.type === 'CLIENT' && command === 'next-booking') {
        const booking = identity.nextBooking;
        await this.send(peer, eventId, booking ? `📅 Ближайшая тренировка: ${trainingDate(booking.startTime)}\nТренер: ${booking.trainer.name}\nЛошадь: ${booking.horse?.name || 'пока не назначена'}` : 'Предстоящих тренировок пока нет.', keyboard);
        return;
      }
      if (client && command === 'membership') {
        const now = new Date();
        const rows = await this.prisma.membership.findMany({ where: { deletedAt: null, type: 'fixed_lessons', status: 'active', validFrom: { lte: now }, validTo: { gte: now }, remainingUnits: { gt: 0 },
          ...membershipAccessWhere(client.id) },
          include: { pricingPlan: { select: { name: true } }, client: { select: { name: true } },
            service: { select: { name: true, title: true } } },
          orderBy: [{ validTo: 'asc' }, { id: 'asc' }], skip: offset, take: 11 });
        const lines = rows.slice(0, 10).map(row => {
          const title = row.title?.trim() || row.serviceTitle?.trim() || row.pricingPlan?.name.trim()
            || row.service?.title.trim() || row.service?.name.trim() || 'Абонемент';
          const remaining = Number(row.remainingUnits);
          const remainingText = Number.isInteger(remaining) ? lessonsLeft(remaining) : `остаток ${row.remainingUnits.toString()}`;
          const family = row.clientId !== client.id
            ? ` (семейный абонемент${row.client?.name ? ` владельца ${row.client.name}` : ''})` : '';
          return `• «${title}»: ${remainingText}${family} (до ${expiryDate(row.validTo)})`;
        });
        await this.send(peer, eventId, lines.length ? `🎫 Ваши абонементы:\n${lines.join('\n')}` : 'У вас пока нет активных абонементов.', rows.length > 10 ? this.next('membership', offset) : menu(false)); return;
      }
      if (client && ['bookings', 'мои тренировки'].includes(command)) {
        const rows = await this.prisma.booking.findMany({ where: { clientId: client.id, status: 'scheduled', startTime: { gte: new Date() }, OR: [{ lessonId: null }, { lesson: { status: 'SCHEDULED', deletedAt: null } }] },
          include: { horse: true, trainer: true, arena: true, lesson: { include: { trainer: true, arena: true } } }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }], skip: offset, take: 11 });
        const cards = rows.slice(0, 10).map(row => {
          const lesson = row.lesson ?? row;
          return [`• ${trainingDate(lesson.startTime)}`,
            `  Лошадь: ${row.horse?.name.trim() || 'пока не назначена'}`,
            `  Тренер: ${lesson.trainer.name.trim() || 'пока не назначен'}`,
            ...(lesson.arena?.name.trim() ? [`  Манеж: ${lesson.arena.name.trim()}`] : []),
          ].join('\n');
        });
        await this.send(peer, eventId, cards.length ? `📅 Предстоящие тренировки:\n${cards.join('\n\n')}` : 'Предстоящих тренировок пока нет.', rows.length > 10 ? this.next('bookings', offset) : menu(false)); return;
      }
      await this.send(peer, eventId, `Здравствуйте, ${staff?.name || client?.firstName || 'всадник'}! Выберите действие. Время: ${zone()}.`, keyboard);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) { await this.send(peer, `${eventId}:error`, error.message); return; }
      throw error;
    }
  }
  private next(command: string, offset: number) { return Keyboard.keyboard([Keyboard.textButton({ label: 'Далее', payload: { command, offset: offset + 10 } })]); }
  private async trainerDay(trainerId: string, offset: number) {
    const start = DateTime.now().setZone('Europe/Moscow').startOf('day');
    const range = { gte: start.toJSDate(), lt: start.plus({ days: 1 }).toJSDate() };
    const statuses = ['scheduled', 'completed', 'no_show'] as const;
    // Merge standalone bookings and lesson sessions before pagination; no booking appears twice.
    const [lessons, standalone] = await Promise.all([
      this.prisma.lesson.findMany({ where: { trainerId, deletedAt: null, status: { not: 'CANCELLED' }, startTime: range },
        include: { bookings: { where: { status: { in: [...statuses] } }, include: { client: true, horse: true }, orderBy: { id: 'asc' } } },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }], take: offset + 11 }),
      this.prisma.booking.findMany({ where: { trainerId, lessonId: null, status: { in: [...statuses] }, startTime: range },
        include: { client: true, horse: true }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }], take: offset + 11 }),
    ]);
    return [...lessons.map(lesson => ({ id: lesson.id, startTime: lesson.startTime, bookings: lesson.bookings, canMarkAttendance: true })),
      ...standalone.map(booking => ({ id: booking.id, startTime: booking.startTime, bookings: [booking], canMarkAttendance: false }))]
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id.localeCompare(b.id)).slice(offset, offset + 11);
  }

  private async today(trainerId: string, peer: number, event: string, offset: number, ridersOnly = false) {
    const rows = await this.trainerDay(trainerId, offset);
    const command = ridersOnly ? 'riders' : 'today';
    if (ridersOnly) {
      const lines = rows.slice(0, 10).flatMap(lesson => lesson.bookings.map(booking =>
        `• ${booking.client.name} — ${trainingDate(lesson.startTime)}${booking.horse ? `, ${booking.horse.name}` : ''}`));
      await this.send(peer, event, lines.length ? `👥 Ваши всадники сегодня:\n${lines.join('\n')}` : 'На сегодня всадники не записаны.',
        rows.length > 10 ? this.next(command, offset) : menu(true));
      return;
    }
    if (!rows.length) { await this.send(peer, event, 'На сегодня занятий нет.', menu(true)); return; }
    for (const lesson of rows.slice(0, 10)) {
      if (!lesson.bookings.length) await this.send(peer, `${event}:${lesson.id}`, `${date(lesson.startTime)} — Участников пока нет.`, menu(true));
      for (const row of lesson.bookings) {
        await this.send(peer, `${event}:${row.id}`, `${date(lesson.startTime)} — ${row.client.name}${row.horse ? `, лошадь ${row.horse.name}` : ''}\nОтметка: ${row.attendanceStatus}`,
          lesson.canMarkAttendance ? Keyboard.keyboard([
            Keyboard.callbackButton({ label: '✅ Присутствовал', payload: { action: 'attendance', bookingId: row.id, attended: true } }),
            Keyboard.callbackButton({ label: '❌ Неявка', payload: { action: 'attendance', bookingId: row.id, attended: false } }),
          ]).inline() : menu(true));
      }
    }
    if (rows.length > 10) await this.send(peer, `${event}:next`, 'Есть ещё занятия', this.next(command, offset));
  }
  async handleEvent(object: unknown): Promise<void> {
    if (!record(object) || typeof object.user_id !== 'number' || !Number.isSafeInteger(object.user_id) || object.user_id <= 0
      || object.peer_id !== object.user_id || typeof object.event_id !== 'string' || !object.event_id || !record(object.payload)) throw new BadRequestException('Некорректное нажатие VK');
    const { bookingId, attended, action } = object.payload;
    if (action !== 'attendance' || typeof bookingId !== 'string' || !isUUID(bookingId) || typeof attended !== 'boolean') throw new BadRequestException('Неизвестная команда');
    let answer = 'Посещение отмечено';
    try {
      const profile = await this.identity.identify(String(object.user_id));
      const trainer = profile.type === 'STAFF' && profile.role === 'TRAINER' && profile.trainerId ? { id: profile.trainerId } : null;
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
