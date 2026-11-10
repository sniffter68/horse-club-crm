import { HttpException, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { Bot, Context, HttpError, InlineKeyboard } from 'grammy';
import AbortController from 'abort-controller';
import { DateTime } from 'luxon';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramPersonalService } from './telegram-personal.service';
import { CLUB_TIMEZONE, TelegramScheduleService } from './telegram-schedule.service';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot?: Bot;
  private startupAbort?: AbortController;
  private stopping = false;
  constructor(private readonly links: TelegramLinkService, private readonly personal: TelegramPersonalService,
    private readonly schedule: TelegramScheduleService) {}

  onModuleInit(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    this.logger.log(`Telegram bot configuration: token present=${Boolean(token)}, token length=${token?.length ?? 0}, mode=polling`);
    if (!token) {
      this.logger.warn('Telegram bot disabled: TELEGRAM_BOT_TOKEN is empty');
      return;
    }
    if (this.bot || this.stopping) return;
    const url = new URL(process.env.TELEGRAM_WEBAPP_URL?.trim() || 'https://crm.horseclub68.ru/tma');
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('TELEGRAM_WEBAPP_URL must be an HTTPS URL');
    const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
    const bot = new Bot(token, {
      client: { timeoutSeconds: 30, ...(apiRoot ? { apiRoot } : {}) },
    });
    this.bot = bot;
    // Binding never consumes an update. Private-chat filtering is separate.
    bot.use(async (ctx, next) => {
      if (ctx.from) await this.links.bindUsername(String(ctx.from.id), ctx.from.username);
      await next();
    });
    bot.use(async (ctx, next) => {
      try {
        if (ctx.chat?.type !== 'private' || !ctx.from) return;
        await next();
      }
      catch (error: unknown) {
        if (!(error instanceof HttpException)) throw error;
        await ctx.reply(error.message);
      }
    });
    const menu = async (sender: string) => {
      const role = await this.personal.identity(sender);
      const keyboard = new InlineKeyboard();
      if (role === 'client') return keyboard.webApp('Записаться на занятие', url.href).row().text('Мои записи', 'my_bookings').text('Мой абонемент', 'my_balance');
      if (role === 'trainer' || role === 'admin') keyboard.webApp('Открыть расписание тренера', new URL('/tma/trainer', url).href).row()
        .text('📅 Расписание на сегодня', 'club_schedule:today').row().text('🗓 Расписание на завтра', 'club_schedule:tomorrow').row();
      keyboard.text('Расписание на день', 'day').row().text('Расписание на неделю', 'week');
      return keyboard;
    };
    bot.command('start', async ctx => {
      const sender = String(ctx.from!.id);
      const message = 'Добро пожаловать в КСК «СЛКС», Тамбов! 🐎\nВыберите занятие и удобное время. Ждём вас: ул. Бастионная, 22АС2.';
      await ctx.reply(message, { reply_markup: await menu(sender) });
    });
    bot.command('help', async ctx => { await ctx.reply('Укажите ваш Telegram username или ID в CRM. Выберите нужный раздел:', { reply_markup: await menu(String(ctx.from!.id)) }); });
    bot.command('balance', async ctx => {
      await ctx.reply(await this.personal.balance(String(ctx.from!.id)), { parse_mode: 'HTML' });
    });
    const showSchedule = async (ctx: Context, day: DateTime) => {
      const user = await this.schedule.authorize(String(ctx.from!.id));
      if (!day.isValid) {
        await ctx.reply('Некорректная дата расписания');
        return;
      }
      const chunks = await this.schedule.getDaySchedule(day.toJSDate(), user.id);
      const keyboard = new InlineKeyboard()
        .text('⬅️ Вчера', `club_schedule:${day.minus({ days: 1 }).toISODate()}`)
        .text('🔄 Обновить', `club_schedule:${day.toISODate()}`)
        .text('Завтра ➡️', `club_schedule:${day.plus({ days: 1 }).toISODate()}`);
      for (const [index, chunk] of chunks.entries()) await ctx.reply(chunk, index === chunks.length - 1 ? { reply_markup: keyboard } : {});
    };
    const clubDay = (tomorrow = false) => DateTime.now().setZone(CLUB_TIMEZONE).startOf('day').plus({ days: tomorrow ? 1 : 0 });
    bot.command('schedule', async ctx => {
      await showSchedule(ctx, clubDay(ctx.match.trim().toLowerCase() === 'tomorrow'));
    });
    bot.hears(['📅 Расписание на сегодня', '🗓 Расписание на завтра'], async ctx => {
      await showSchedule(ctx, clubDay(ctx.msg?.text === '🗓 Расписание на завтра'));
    });
    bot.callbackQuery(/^club_schedule:(today|tomorrow|\d{4}-\d{2}-\d{2})$/, async ctx => {
      await ctx.answerCallbackQuery();
      const value = ctx.match[1];
      await showSchedule(ctx, value === 'today' || value === 'tomorrow' ? clubDay(value === 'tomorrow') : DateTime.fromISO(value, { zone: CLUB_TIMEZONE }));
    });
    bot.on('message:text', async ctx => {
      const sender = String(ctx.from!.id);
      await ctx.reply('Выберите раздел:', { reply_markup: await menu(sender) });
    });
    bot.callbackQuery(['my_bookings', 'my_balance'], async ctx => {
      await ctx.answerCallbackQuery();
      const sender = String(ctx.from!.id);
      if (ctx.callbackQuery.data === 'my_balance') await ctx.reply(await this.personal.balance(sender), { parse_mode: 'HTML' });
      else await ctx.reply(await this.personal.bookings(sender));
    });
    bot.callbackQuery(['day', 'week'], async ctx => {
      await ctx.answerCallbackQuery();
      const rows = await this.personal.schedule(String(ctx.from!.id), ctx.callbackQuery.data === 'week');
      if (!rows.length) await ctx.reply('В расписании пока нет занятий или смен');
      for (const row of rows) await ctx.reply(row.text, row.actionable ? { reply_markup: new InlineKeyboard().text('Состоялось', `done:${row.id}`).text('Отмена', `cancel:${row.id}`) } : {});
    });
    bot.callbackQuery(/^(done|cancel|confirm_done|confirm_cancel|confirm_refund):([\da-f-]{36})$/, async ctx => {
      await ctx.answerCallbackQuery();
      const [, action, id] = ctx.match;
      const sender = String(ctx.from!.id);
      if (!action.startsWith('confirm_')) {
        await this.personal.user(sender, true);
        const keyboard = action === 'done' ? new InlineKeyboard().text('Подтвердить', `confirm_done:${id}`)
          : new InlineKeyboard().text('Отменить без возврата оплаты', `confirm_cancel:${id}`).row().text('Отменить с возвратом оплаты', `confirm_refund:${id}`);
        await ctx.reply(action === 'done' ? 'Отметить занятие как состоявшееся?' : 'Отменить занятие? Посещение абонемента восстановится. Выберите решение по оплате. Возврат денег требует полного доступа к кассе.',
          { reply_markup: keyboard.row().text('Назад', 'day') });
        return;
      }
      await this.personal.status(sender, id, action === 'confirm_done' ? 'COMPLETED' : 'CANCELLED', action === 'confirm_refund');
      await ctx.reply('Статус занятия обновлён');
    });
    bot.catch(err => {
      const updateType = Object.keys(err.ctx.update).filter(key => key !== 'update_id').join(',');
      this.logger.error(`Telegram update failed: update_id=${err.ctx.update.update_id}, type=${updateType}\n${this.describeError(err.error, token)}`);
    });
    this.logger.log('Telegram bot handlers registered; preparing polling');
    // Do not await the polling loop in the Nest initialization hook.
    void this.startPolling(bot, token).catch((error: unknown) => {
      if (this.stopping) return;
      this.logger.error(`Telegram polling failed\n${this.describeError(error, token)}`);
    });
  }

  private async startPolling(bot: Bot, token: string): Promise<void> {
    this.logger.log('Telegram bot deleting webhook before polling');
    try {
      await this.withStartupTimeout(signal => bot.api.deleteWebhook({ drop_pending_updates: true }, signal), 10_000);
      this.logger.log('Telegram bot webhook deleted; pending updates dropped');
    } catch (error: unknown) {
      if (this.stopping) return;
      this.logger.warn(`Telegram webhook cleanup failed; polling will retry webhook deletion\n${this.describeError(error, token)}`);
    }
    if (this.stopping) return;
    this.logger.log('Telegram bot initializing getMe');
    // Explicit init also makes getMe cancellable during shutdown.
    await this.withStartupTimeout(signal => bot.init(signal), 30_000);
    if (this.stopping) return;
    this.logger.log('Telegram bot starting polling');
    await bot.start({
      timeout: 20,
      drop_pending_updates: true,
      allowed_updates: ['message', 'callback_query'],
      onStart: () => {
        if (!this.stopping) this.logger.log('Telegram bot polling started successfully');
      },
    }).catch((error: unknown) => {
      this.logger.error(`Telegram bot.start() failed\n${this.describeError(error, token)}`);
    });
  }

  private async withStartupTimeout<T>(operation: (signal: AbortController['signal']) => Promise<T>, milliseconds: number): Promise<T> {
    const controller = new AbortController();
    this.startupAbort = controller;
    const timer = setTimeout(() => controller.abort(), milliseconds);
    timer.unref();
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timer);
      this.startupAbort = undefined;
    }
  }

  private describeError(error: unknown, token: string): string {
    const seen = new Set<unknown>();
    const describe = (value: unknown): string => {
      if (seen.has(value)) return '[circular error]';
      seen.add(value);
      if (!(value instanceof Error)) return String(value);
      const details = [value.stack || `${value.name}: ${value.message}`];
      if ('code' in value) details.push(`code=${String(value.code)}`);
      if ('error_code' in value) details.push(`Telegram API code=${String(value.error_code)}`);
      if (value instanceof HttpError) details.push(`network error: ${describe(value.error)}`);
      if (value.cause !== undefined) details.push(`cause: ${describe(value.cause)}`);
      return details.join('\n');
    };
    return describe(error).split(token).join('[REDACTED]').split(encodeURIComponent(token)).join('[REDACTED]');
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.startupAbort?.abort();
    if (this.bot?.isRunning()) {
      this.logger.log('Telegram bot stopping polling');
      try {
        await this.bot.stop();
        this.logger.log('Telegram bot polling stopped');
      } catch (error: unknown) {
        this.logger.error(`Telegram bot stop failed\n${this.describeError(error, this.bot.token)}`);
      }
    }
  }
}
