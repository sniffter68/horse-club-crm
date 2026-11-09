import { HttpException, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramPersonalService } from './telegram-personal.service';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot?: Bot;
  constructor(private readonly links: TelegramLinkService, private readonly personal: TelegramPersonalService) {}

  onModuleInit(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return;
    const url = new URL(process.env.TELEGRAM_WEBAPP_URL?.trim() || 'https://crm.horseclub68.ru/tma');
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('TELEGRAM_WEBAPP_URL must be an HTTPS URL');
    const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
    const bot = new Bot(token, {
      client: apiRoot ? { apiRoot } : {},
    });
    this.bot = bot;
    bot.use(async (ctx, next) => {
      if (ctx.chat?.type !== 'private' || !ctx.from) return;
      try { await next(); }
      catch (error: unknown) {
        if (!(error instanceof HttpException)) throw error;
        await ctx.reply(error.message);
      }
    });
    const menu = async (sender: string) => {
      const role = await this.personal.identity(sender);
      const keyboard = new InlineKeyboard();
      if (role === 'client') return keyboard.webApp('Записаться на занятие', url.href).row().text('Мои записи', 'my_bookings').text('Баланс абонемента', 'my_balance');
      keyboard.text('Расписание на день', 'day').row().text('Расписание на неделю', 'week');
      return keyboard;
    };
    const link = async (input: string, sender: string, username?: string) => {
      const role = await this.links.consume(input, sender, username);
      return role === 'client' ? 'Ваш Telegram успешно привязан к личному кабинету КСК «СЛКС»!'
        : 'Ваш Telegram успешно привязан к профилю тренера/администратора КСК «СЛКС»! Меню управления активировано.';
    };
    bot.command('start', async ctx => {
      const sender = String(ctx.from!.id);
      const message = ctx.match ? await link(ctx.match.trim(), sender, ctx.from?.username)
        : 'Добро пожаловать в КСК «СЛКС», Тамбов! 🐎\nВыберите занятие и удобное время. Ждём вас: ул. Бастионная, 22АС2.';
      await ctx.reply(message, { reply_markup: await menu(sender) });
    });
    bot.command('help', async ctx => { await ctx.reply('Для привязки отправьте код из CRM. Выберите нужный раздел:', { reply_markup: await menu(String(ctx.from!.id)) }); });
    bot.on('message:text', async ctx => {
      const sender = String(ctx.from!.id);
      if (/^\d{4,6}$/.test(ctx.message.text.trim())) await ctx.reply(await link(ctx.message.text.trim(), sender, ctx.from?.username), { reply_markup: await menu(sender) });
      else await ctx.reply('Отправьте код привязки из CRM или выберите раздел:', { reply_markup: await menu(sender) });
    });
    bot.callbackQuery(['my_bookings', 'my_balance'], async ctx => {
      await ctx.answerCallbackQuery();
      const sender = String(ctx.from!.id);
      await ctx.reply(ctx.callbackQuery.data === 'my_balance' ? await this.personal.balance(sender) : await this.personal.bookings(sender));
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
    bot.catch(() => this.logger.warn('Telegram update failed; token and user data omitted'));
    // Start polling without blocking CRM startup. Exactly one backend replica should poll.
    void bot.start({ onStart: () => this.logger.log('Telegram bot polling started') })
      .catch(() => this.logger.error('Telegram polling stopped; check bot configuration and network'));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot?.isRunning()) await this.bot.stop();
  }
}
