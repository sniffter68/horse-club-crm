import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot?: Bot;

  onModuleInit(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return;
    const url = new URL(process.env.TELEGRAM_WEBAPP_URL?.trim() || 'https://crm.horseclub68.ru/tma');
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('TELEGRAM_WEBAPP_URL must be an HTTPS URL');
    const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
    const bot = new Bot(token, {
      client: {
        ...(apiRoot ? { apiRoot } : {}),
      },
    });
    this.bot = bot;
    bot.command('start', async ctx => {
      if (ctx.chat.type !== 'private') return;
      await ctx.reply('Добро пожаловать в КСК «СЛКС», Тамбов! 🐎\nВыберите занятие и удобное время. Ждём вас: ул. Бастионная, 22АС2.',
        { reply_markup: new InlineKeyboard().webApp('Записаться на занятие', url.href) });
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
