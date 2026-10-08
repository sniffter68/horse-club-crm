import { useState, type ReactElement, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const serviceOptions = [
  'Выездка',
  'Конкур',
  'Конная прогулка',
  'Фотосессия',
  'Экскурсия по клубу',
];

export function ContactsSection(): ReactElement {
  const [selectedService, setSelectedService] = useState<string>('Выездка');
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    // Имитация отправки формы (сюда можно подключить Telegram Webhook или API)
    setIsSubmitted(true);
  };

  return (
    <section
      id="contacts"
      className="relative overflow-hidden bg-[#241E1C] px-6 py-28 text-white sm:px-10 lg:px-16"
    >
      {/* Декоративное теплое свечение сзади */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-1/4 h-[550px] w-[550px] rounded-full bg-[#724C39]/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl">
        {/* Верхний заголовок секции */}
        <div className="mb-16 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[#A6988E]">
              Связь и бронирование
            </span>
            <h2 className="mt-3 font-serif text-4xl font-normal tracking-tight text-[#E4DAD0] sm:text-6xl">
              Визит в клуб
            </h2>
          </div>
          <p className="max-w-md text-xs sm:text-sm leading-relaxed text-[#A6988E]">
            Мы ценим приватность и индивидуальный подход: все тренировки и посещения клуба проходят по предварительной записи.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 items-start">
          {/* Левая колонка: Контакты, адрес, навигация */}
          <div className="flex flex-col gap-10 lg:col-span-5">
            {/* Карточка адреса и режима */}
            <div className="rounded-[2.4rem] border border-white/10 bg-white/5 p-8 backdrop-blur-md">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#A6988E]">
                Локация клуба
              </span>
              <h3 className="mt-2 font-serif text-2xl font-light text-white">
                Тамбов, ул. Бастионная, 22АС2
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#A6988E]">
                Удобный подъезд с закрытой охраняемой парковкой для гостей клуба.
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <a
                  href="https://yandex.ru/maps/?text=Тамбов+ул+Бастионная+22АС2"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-medium text-[#E4DAD0] transition-all hover:bg-white/20 active:scale-95"
                >
                  <span>Яндекс Карты</span>
                  <span className="text-xs">↗</span>
                </a>
                <a
                  href="https://2gis.ru/tambov"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-medium text-[#E4DAD0] transition-all hover:bg-white/20 active:scale-95"
                >
                  <span>2ГИС</span>
                  <span className="text-xs">↗</span>
                </a>
              </div>
            </div>

            {/* Карточка контактов и часов работы */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-[#A6988E]">
                  Прямой телефон
                </span>
                <a
                  href="tel:+79000000000"
                  className="mt-2 block font-serif text-xl text-white transition-colors hover:text-[#E4DAD0]"
                >
                  +7 (900) 000-00-00
                </a>
                <span className="mt-1 block text-[11px] text-[#A6988E]">
                  Ежедневно 09:00 — 20:00
                </span>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-[#A6988E]">
                  Мессенджеры
                </span>
                <div className="mt-2 flex gap-3">
                  <a
                    href="https://t.me/"
                    target="_blank"
                    rel="noreferrer"
                    className="font-serif text-base text-[#E4DAD0] underline underline-offset-4 hover:text-white transition-colors"
                  >
                    Telegram
                  </a>
                  <span className="text-white/20">·</span>
                  <a
                    href="https://wa.me/"
                    target="_blank"
                    rel="noreferrer"
                    className="font-serif text-base text-[#E4DAD0] underline underline-offset-4 hover:text-white transition-colors"
                  >
                    WhatsApp
                  </a>
                </div>
                <span className="mt-1 block text-[11px] text-[#A6988E]">
                  Быстрый ответ дежурного
                </span>
              </div>
            </div>

            {/* Памятка первого визита */}
            <div className="rounded-3xl border border-white/10 bg-[#724C39]/15 p-6 text-xs text-[#E4DAD0]/90">
              <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-white mb-2">
                <span>✦</span>
                <span>Рекомендации к первому визиту</span>
              </div>
              <p className="leading-relaxed">
                Шлем и защитный жилет предоставляются клубом бесплатно. Для первой тренировки подойдут эластичные брюки без грубых внутренних швов и закрытая обувь на небольшом плоском каблуке (1-2 см).
              </p>
            </div>
          </div>

          {/* Правая колонка: Форма записи */}
          <div className="lg:col-span-7">
            <div className="relative rounded-[2.8rem] bg-white p-8 text-[#241E1C] shadow-2xl sm:p-12">
              <AnimatePresence mode="wait">
                {isSubmitted ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center justify-center py-12 text-center"
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E4DAD0] text-2xl text-[#3A2F2B] mb-5">
                      ✓
                    </div>
                    <h3 className="font-serif text-3xl font-normal text-[#241E1C]">
                      Заявка принята
                    </h3>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-[#6E645F]">
                      Благодарим вас, <span className="font-semibold text-[#241E1C]">{name}</span>! Администратор клуба свяжется с вами по номеру <span className="font-semibold text-[#241E1C]">{phone}</span> в течение 15 минут для подтверждения времени и подбора лошади.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSubmitted(false);
                        setName('');
                        setPhone('');
                        setNotes('');
                      }}
                      className="mt-8 rounded-full border border-black/15 bg-transparent px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#3A2F2B] transition-all hover:bg-black/5"
                    >
                      Отправить ещё одну заявку
                    </button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    onSubmit={handleSubmit}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col gap-6"
                  >
                    <div>
                      <div className="inline-block rounded-full bg-[#E4DAD0]/60 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5A483E] mb-3">
                        Онлайн-запись
                      </div>
                      <h3 className="font-serif text-3xl sm:text-4xl font-normal text-[#241E1C]">
                        Забронировать занятие
                      </h3>
                      <p className="mt-1 text-xs text-[#6E645F]">
                        Выберите направление и оставьте контактные данные.
                      </p>
                    </div>

                    {/* Выбор направления */}
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8C7E77] mb-2.5">
                        Направление
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {serviceOptions.map((srv) => {
                          const isSel = selectedService === srv;
                          return (
                            <button
                              key={srv}
                              type="button"
                              onClick={() => setSelectedService(srv)}
                              className={`rounded-full px-4 py-2 text-xs font-medium transition-all ${
                                isSel
                                  ? 'bg-[#3A2F2B] text-white shadow-sm'
                                  : 'border border-black/10 bg-[#FAF7F2] text-[#6E645F] hover:text-[#241E1C] hover:border-black/20'
                              }`}
                            >
                              {srv}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Поля ввода: Имя и Телефон */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8C7E77] mb-1.5">
                          Ваше имя *
                        </label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Анастасия"
                          className="w-full rounded-2xl border border-black/10 bg-[#FAF7F2] px-4 py-3.5 text-base text-[#241E1C] outline-none transition-all placeholder:text-[#B3A8A0] focus:border-[#3A2F2B] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8C7E77] mb-1.5">
                          Телефон *
                        </label>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+7 (900) 000-00-00"
                          className="w-full rounded-2xl border border-black/10 bg-[#FAF7F2] px-4 py-3.5 text-base text-[#241E1C] outline-none transition-all placeholder:text-[#B3A8A0] focus:border-[#3A2F2B] focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Пожелания / комментарий */}
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8C7E77] mb-1.5">
                        Удобная дата или опыт верховой езды (необязательно)
                      </label>
                      <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Например: суббота, первая половина дня. Опыта нет, хотелось бы спокойную лошадь."
                        className="w-full resize-none rounded-2xl border border-black/10 bg-[#FAF7F2] px-4 py-3.5 text-base text-[#241E1C] outline-none transition-all placeholder:text-[#B3A8A0] focus:border-[#3A2F2B] focus:bg-white"
                      />
                    </div>

                    {/* Кнопка отправки и согласие */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        className="w-full rounded-2xl bg-[#614535] py-4 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-lg transition-all hover:bg-[#432F24] hover:scale-[1.01] active:scale-[0.99]"
                      >
                        Отправить заявку на тренировку ↗
                      </button>

                      <p className="mt-3 text-center text-[11px] text-[#9C8F87]">
                        Нажимая кнопку, вы соглашаетесь на обработку персональных данных в соответствии с политикой конфиденциальности клуба.
                      </p>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
