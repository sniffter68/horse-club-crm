import { useEffect, useRef, useState, type ReactElement, type FormEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { phoneDigits, phoneMask, sendLead } from '../lead';
import { PrivacyPolicyLink } from './PrivacyPolicyLink';
import { legal } from '../legal';
import { firstLesson, otherServices, bookingNotes, type BookingSelection, type BookingKind, type ChooseBooking } from '../booking';
import type { PublicService } from '../usePublicContent';
import { landingData } from '../data/landingContent';

export function ContactsSection({ services, selection, onChoose, onRemove, onReset, quickBookingOpen, onCloseQuickBooking }: {
  quickBookingOpen: boolean; onCloseQuickBooking: () => void;
  services: PublicService[]; selection: BookingSelection; onChoose: ChooseBooking;
  onRemove: (kind: BookingKind) => void; onReset: () => void;
}): ReactElement {
  const reducedMotion = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!quickBookingOpen) return;
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    element?.querySelector<HTMLElement>('#booking-heading')?.focus();
    return () => {
      element?.close();
      requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
    };
  }, [quickBookingOpen]);
  // Only exact canonical labels can supply a CRM ID; never attach an unrelated discipline.
  const available = [firstLesson, ...otherServices].map(choice => ({
    ...choice, id: services.find(service => service.title === choice.name)?.id || choice.id,
  }));
  const selectedService = selection.service?.name || firstLesson.name;
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [age, setAge] = useState('');
  const notesWithAge = [age && `Возраст всадника: ${age}`, notes].filter(Boolean).join('\n');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [consent, setConsent] = useState(false);
  const submitting = useRef(false);
  const serviceList = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (serviceList.current) serviceList.current.open = false;
    setIsSubmitted(false);
  }, [selection.service]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting.current) return;
    const form = e.currentTarget;
    const invalid = !name.trim() ? ['Укажите имя', 'contact-name']
      : phoneDigits(phone).length !== 11 ? ['Укажите телефон полностью: +7 и 10 цифр', 'contact-phone']
      : bookingNotes(selection, notesWithAge).length > 2000 ? ['Сократите комментарий: вместе с выбранной лошадью и тренером допускается 2000 символов', 'contact-notes']
      : !consent ? ['Подтвердите согласие, чтобы отправить заявку', 'personal-data-consent'] : null;
    if (invalid) {
      setError(invalid[0]);
      setInvalidField(invalid[1]);
      form.querySelector<HTMLElement>(`#${invalid[1]}`)?.focus();
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError('');
    setInvalidField('');
    try {
      await sendLead({ name: name.trim(), phone: `+${phoneDigits(phone)}`, direction: selectedService.slice(0, 100),
        ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selection.service?.id || '') ? { serviceId: selection.service!.id } : {}),
        notes: bookingNotes(selection, notesWithAge) || undefined, source: 'landing', consentAccepted: true, consentVersion: legal.consentVersion });
      setIsSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить заявку. Попробуйте ещё раз.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const bookingPanel = (
    <div id="booking-form" className="scroll-mt-20 lg:col-span-7">
      <div className="relative rounded-[2.8rem] bg-white p-5 md:p-6 text-club-deep shadow-2xl">
        <AnimatePresence mode="wait">
          {isSubmitted ? (
            <motion.div
              key="success"
              role="status"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-club-sand text-2xl text-club-ink mb-5">
                ✓
              </div>
              <h3 className="font-serif text-club-deep text-lg sm:text-xl font-semibold">
                Заявка принята!
              </h3>
              <p className="mt-3 max-w-md text-sm sm:text-base leading-relaxed text-club-secondary">
                Мы получили ваши контакты. Администратор клуба свяжется с вами в ближайшее время, чтобы согласовать дату и время первого занятия.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsSubmitted(false);
                  setName('');
                  setPhone('');
                  setNotes('');
                  setAge('');
                  setConsent(false);
                  setError('');
                  onReset();
                }}
                className="mt-6 rounded-full border border-black/15 bg-transparent px-6 py-2.5 text-sm font-semibold text-club-ink transition-all hover:bg-black/5"
              >
                Отправить ещё одну заявку
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              noValidate
              aria-busy={loading}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-6"
            >
              <div>
                <div className="inline-block rounded-full bg-club-sand/60 px-4 py-1 text-sm font-semibold text-club-secondary mb-3">
                  Онлайн-запись
                </div>
                <h3 id="booking-heading" tabIndex={-1} className="font-serif text-club-deep text-lg sm:text-xl font-semibold">
                  Запись на первое занятие
                </h3>
                <p className="mt-1 text-sm sm:text-base text-club-secondary">
                  Оставьте контактные данные — администратор клуба перезвонит вам и поможет подобрать удобное время
                </p>
              </div>

              {/* Выбор направления */}
              <div>
                <p className="rounded-2xl bg-club-sand/60 px-4 py-3 text-sm sm:text-base text-club-ink" aria-live="polite">
                  Выбранная услуга: <strong>{selectedService}</strong>
                </p>
                <details ref={serviceList} className="mt-2">
                  <summary className="w-fit cursor-pointer rounded-lg py-2 text-sm text-club-secondary underline underline-offset-4 hover:text-club-deep">
                    Выбрать другую услугу
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Услуги">
                    {available.map(srv => (
                      <button key={srv.id} type="button" disabled={loading}
                        aria-pressed={selectedService === srv.name}
                        onClick={() => {
                          onChoose('service', srv);
                          serviceList.current?.querySelector('summary')?.focus();
                        }}
                        className={`min-h-11 cursor-pointer rounded-2xl border px-4 py-2 text-left text-sm transition-colors disabled:cursor-wait disabled:opacity-60 ${selectedService === srv.name
                          ? 'border-club-ink bg-club-ink text-white'
                          : 'border-black/10 bg-club-paper text-club-secondary hover:border-black/30'}`}>
                        {srv.name}
                      </button>
                    ))}
                  </div>
                </details>
                <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
                  {(['horse', 'trainer'] as const).map(kind => selection[kind] && <button key={kind} type="button"
                    disabled={loading} className="rounded-full border border-black/10 bg-club-paper px-4 py-2 text-sm font-medium text-club-secondary" onClick={() => onRemove(kind)}
                    aria-label={`Убрать ${kind === 'horse' ? 'лошадь' : 'тренера'}: ${selection[kind]!.name}`}>
                    {kind === 'horse' ? 'Лошадь' : 'Тренер'}: {selection[kind]!.name} <span aria-hidden="true">×</span>
                  </button>)}
                </div>
              </div>

              {/* Поля ввода: Имя и Телефон */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-name" className="block text-sm font-semibold text-club-secondary mb-1.5">
                    Ваше имя *
                  </label>
                  <input
                    type="text"
                    id="contact-name"
                    aria-invalid={invalidField === 'contact-name'}
                    aria-describedby={invalidField === 'contact-name' ? 'contact-error' : undefined}
                    autoComplete="given-name"
                    maxLength={100}
                    disabled={loading}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например, Анна"
                    className="w-full rounded-2xl border border-black/10 bg-club-paper px-4 py-3.5 text-base text-club-deep outline-none transition-all placeholder:text-club-secondary focus:border-club-ink focus:bg-white"
                  />
                </div>

                <div>
                  <label htmlFor="contact-phone" className="block text-sm font-semibold text-club-secondary mb-1.5">
                    Телефон *
                  </label>
                  <input
                    type="tel"
                    id="contact-phone"
                    aria-invalid={invalidField === 'contact-phone'}
                    aria-describedby={invalidField === 'contact-phone' ? 'contact-error' : undefined}
                    autoComplete="tel"
                    disabled={loading}
                    required
                    value={phone}
                    onChange={(e) => setPhone(phoneMask(e.target.value))}
                    placeholder="+7 (___) ___-__-__"
                    className="w-full rounded-2xl border border-black/10 bg-club-paper px-4 py-3.5 text-base text-club-deep outline-none transition-all placeholder:text-club-secondary focus:border-club-ink focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="rider-age" className="mb-1.5 block text-sm font-semibold text-club-secondary">Возраст всадника (необязательно, для детей)</label>
                <select id="rider-age" value={age} onChange={event => setAge(event.target.value)} disabled={loading}
                  className="min-h-11 w-full rounded-2xl border border-black/10 bg-club-paper px-4 py-3 text-base">
                  <option value="">Не указан</option>
                  <option value="до 3 лет">До 3 лет — уточнить возможность</option>
                  <option value="3–6 лет">3–6 лет</option>
                  <option value="7–12 лет">7–12 лет</option>
                  <option value="13–17 лет">13–17 лет</option>
                </select>
              </div>
              {/* Пожелания / комментарий */}
              <div>
                <label htmlFor="contact-notes" className="block text-sm font-semibold text-club-secondary mb-1.5">
                  Пожелания к занятию (необязательно)
                </label>
                <textarea
                  id="contact-notes"
                  aria-invalid={invalidField === 'contact-notes'}
                  aria-describedby={invalidField === 'contact-notes' ? 'contact-error' : undefined}
                  maxLength={2000}
                  disabled={loading}
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Для ребёнка / для взрослого, удобные выходные или будни"
                  className="w-full resize-none rounded-2xl border border-black/10 bg-club-paper px-4 py-3.5 text-base text-club-deep outline-none transition-all placeholder:text-club-secondary focus:border-club-ink focus:bg-white"
                />
              </div>

              {/* Кнопка отправки и согласие */}
              <div className="pt-2">
                <div className="mb-4 flex items-start gap-3 text-sm text-club-secondary">
                  <input id="personal-data-consent" type="checkbox" checked={consent} disabled={loading}
                    aria-invalid={invalidField === 'personal-data-consent'}
                    aria-describedby={invalidField === 'personal-data-consent' ? 'contact-error' : undefined}
                    onChange={(e) => setConsent(e.target.checked)} className="h-11 w-11 shrink-0 cursor-pointer accent-club-action" />
                  <div><label htmlFor="personal-data-consent" className="cursor-pointer">Я согласен на обработку персональных данных в соответствии с </label><PrivacyPolicyLink /></div>
                </div>
                <div className="min-h-12 text-sm text-[#8C3838]" aria-live="polite">
                  {error && <p id="contact-error" role="alert">{error}</p>}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full cursor-pointer rounded-2xl bg-club-action py-4 text-sm font-semibold text-white shadow-lg transition-all hover:bg-club-deep hover:scale-[1.01] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 disabled:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-club-action"
                >
                  {loading ? 'Отправляем…' : 'Оставить заявку на первое занятие'}
                </button>

                <div className="mt-3 text-center text-sm text-club-secondary">
                  Перезвоним или напишем в течение 15 минут
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <section
      id="contacts"
      className="relative overflow-hidden bg-club-deep px-6 py-10 md:py-16 text-white sm:px-10 lg:px-16"
    >
      {/* Декоративное теплое свечение сзади */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-1/4 h-[550px] w-[550px] rounded-full bg-club-action/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl">
        {/* Верхний заголовок секции */}
        <div className="mb-6 md:mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <span className="text-sm font-semibold text-club-sand">
              Связь и бронирование
            </span>
            <h2 className="leading-[1.125] mt-3 font-serif tracking-tight text-club-sand text-2xl sm:text-3xl lg:text-4xl font-normal">
              Визит в клуб
            </h2>
          </div>
          <p className="max-w-md text-sm sm:text-base leading-relaxed text-club-sand">
            Мы ценим приватность и индивидуальный подход: все тренировки и посещения клуба проходят по предварительной записи.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-12 items-start">
          {/* Левая колонка: Контакты, адрес, навигация */}
          <div className="flex flex-col gap-6 lg:col-span-5">
            {/* Карточка адреса и режима */}
            <div className="rounded-[2.4rem] border border-white/10 bg-white/5 p-5 md:p-6 backdrop-blur-md">
              <span className="text-sm font-semibold text-club-sand">
                Локация клуба
              </span>
              <h3 className="mt-2 font-serif text-white text-lg sm:text-xl font-semibold">
                Тамбов, ул. Бастионная, 22АС2
              </h3>
              <p className="mt-2 text-sm sm:text-base leading-relaxed text-club-sand">
                Удобный подъезд с закрытой охраняемой парковкой для гостей клуба.
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <a
                  href="https://yandex.ru/maps/?text=Тамбов+ул+Бастионная+22АС2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-club-sand transition-all hover:bg-white/20 active:scale-95"
                >
                  <span>Яндекс Карты</span>
                </a>
                <a
                  href="https://2gis.ru/tambov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-club-sand transition-all hover:bg-white/20 active:scale-95"
                >
                  <span>2ГИС</span>
                </a>
              </div>
            </div>

            {/* Карточка контактов и часов работы */}
            <div className="grid grid-cols-1 gap-6 min-[600px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="min-w-0 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <span className="block text-sm font-semibold text-club-sand">
                  Прямой телефон
                </span>
                <a
                  href={`tel:${landingData.contacts.phone.replace(/[^+\d]/g, '')}`}
                  className="mt-2 block whitespace-nowrap font-serif text-xl text-white transition-colors hover:text-club-sand"
                >
                  {landingData.contacts.phone}
                </a>
                <span className="mt-1 block text-sm text-club-sand">
                  {landingData.contacts.workingHours}
                </span>
              </div>

              <div className="min-w-0 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <span className="block text-sm font-semibold text-club-sand">
                  Новости клуба
                </span>
                <div className="mt-2 flex flex-wrap gap-3">
                  <a
                    href={landingData.contacts.vkGroup}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center font-serif text-base text-club-sand underline underline-offset-4 hover:text-white transition-colors"
                  >
                    ВКонтакте
                  </a>
                  <a href={landingData.contacts.max} target="_blank" rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-white">MAX</a>
                </div>
                <span className="mt-1 block text-sm text-club-sand">
                  События и жизнь клуба
                </span>
              </div>
            </div>


          </div>

          {/* Правая колонка: Форма записи */}
          {quickBookingOpen ? (
            <dialog ref={dialog} aria-label="Быстрая запись" onCancel={onCloseQuickBooking} onClose={onCloseQuickBooking}
              className="quick-booking fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl bg-white p-1 text-club-deep shadow-2xl backdrop:bg-black/60">
              <div className="sticky top-0 z-10 flex justify-end bg-white p-3">
                <button type="button" onClick={onCloseQuickBooking}
                  className="min-h-11 rounded-full border border-club-secondary px-5 text-sm transition-colors hover:bg-club-sand active:bg-club-paper">Закрыть</button>
              </div>
              {bookingPanel}
            </dialog>
          ) : bookingPanel}
        </div>
      </div>
    </section>
  );
}
