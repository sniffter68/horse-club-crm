import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  LoaderCircle,
  MapPin,
  Phone,
  Send,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { legal } from '../legal';
import { phoneDigits, phoneMask, sendLead, type LeadPayload } from '../lead';
import type { ContactInfo, ServiceItem } from '../types/content';

interface Props {
  contacts: ContactInfo;
  services: ServiceItem[];
}

interface FormErrors {
  name?: string;
  phone?: string;
  service?: string;
  consent?: string;
}

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

function telephoneHref(phone: string): string {
  return `tel:+${phoneDigits(phone)}`;
}

export function ContactsSection({ contacts, services }: Props): ReactElement {
  const prefersReducedMotion = useReducedMotion();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState('');
  const isSubmittingRef = useRef(false);
  const consentRef = useRef<HTMLInputElement>(null);

  const selectedService = services.find((service) => service.id === serviceId);
  const mapUrl = `https://yandex.ru/maps/?pt=${contacts.coordinates[1]},${contacts.coordinates[0]}&z=16&l=map`;

  const clearFeedback = (): void => {
    if (status !== 'idle') {
      setStatus('idle');
    }
    if (submitError) {
      setSubmitError('');
    }
  };

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setPhone(phoneMask(event.target.value));
    setErrors((current) => ({ ...current, phone: undefined }));
    clearFeedback();
  };

  const handlePhoneKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (
      event.key === 'Backspace'
      && event.currentTarget.selectionStart === phone.length
      && event.currentTarget.selectionEnd === phone.length
      && /\D$/.test(phone)
    ) {
      event.preventDefault();
      const digits = phoneDigits(phone);
      setPhone(phoneMask(digits.slice(0, -1)));
      setErrors((current) => ({ ...current, phone: undefined }));
      clearFeedback();
    }
  };

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};
    if (!name.trim()) {
      nextErrors.name = 'Укажите имя';
    }
    if (phoneDigits(phone).length !== 11) {
      nextErrors.phone = 'Укажите телефон полностью';
    }
    if (!serviceId) {
      nextErrors.service = 'Выберите услугу';
    }
    if (!consentAccepted) {
      nextErrors.consent = 'Подтвердите согласие, чтобы отправить заявку';
    }
    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }

    const website = new FormData(event.currentTarget).get('website');
    if (typeof website === 'string' && website.length > 0) {
      setStatus('success');
      return;
    }

    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError('');
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.consent) {
        consentRef.current?.focus();
      }
      return;
    }

    if (!selectedService) {
      setErrors({ service: 'Выберите услугу' });
      return;
    }

    const payload: LeadPayload = {
      consentAccepted: true,
      consentVersion: legal.consentVersion,
      firstName: name.trim(),
      phone: `+${phoneDigits(phone)}`,
      preferences: `Выбранная услуга: ${selectedService.title}`,
    };

    isSubmittingRef.current = true;
    setStatus('submitting');
    try {
      await sendLead(payload);
      setStatus('success');
      setName('');
      setPhone('');
      setServiceId('');
      setConsentAccepted(false);
      setErrors({});
    } catch (error: unknown) {
      setStatus('error');
      setSubmitError(error instanceof Error ? error.message : 'Не удалось отправить заявку. Попробуйте ещё раз.');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const inputClassName =
    'mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-base text-white outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-amber-100/50 focus:ring-4 focus:ring-amber-100/5';

  return (
    <section id="contacts" className="relative overflow-hidden bg-[#0B0C0E] px-6 py-24 sm:px-10 sm:py-32 lg:px-12">
      <div aria-hidden="true" className="absolute -left-40 top-24 h-96 w-96 rounded-full bg-amber-100/[0.055] blur-3xl" />
      <div aria-hidden="true" className="absolute bottom-0 right-0 h-[30rem] w-[30rem] rounded-full bg-white/[0.035] blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(30rem,1fr)] lg:gap-20">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
          whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        >
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-amber-100/75">Контакты</p>
          <h2 className="mt-5 max-w-2xl text-balance text-4xl font-light leading-tight tracking-[-0.04em] text-white sm:text-6xl">
            Начнём с первого знакомства.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400">
            Оставьте заявку или позвоните нам. Подберём подходящий формат и ответим на вопросы.
          </p>

          <div className="mt-10 space-y-3">
            <a
              href={telephoneHref(contacts.phone)}
              className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-amber-100">
                <Phone aria-hidden="true" className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <span>
                <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-zinc-500">Основной телефон</span>
                <span className="mt-1 block text-lg tracking-tight text-white">{contacts.phone}</span>
              </span>
            </a>

            <a
              href={telephoneHref(contacts.altPhone)}
              className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-amber-100">
                <Phone aria-hidden="true" className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <span>
                <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-zinc-500">Дополнительный телефон</span>
                <span className="mt-1 block text-lg tracking-tight text-white">{contacts.altPhone}</span>
              </span>
            </a>

            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-amber-100">
                <MapPin aria-hidden="true" className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <span>
                <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-zinc-500">Адрес</span>
                <span className="mt-1 block max-w-sm text-base leading-6 text-white">{contacts.address}</span>
              </span>
              <ArrowUpRight aria-hidden="true" className="ml-auto mt-1 h-4 w-4 shrink-0 text-zinc-500 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
            </a>

            <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-amber-100">
                <Clock3 aria-hidden="true" className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <span>
                <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-zinc-500">Часы работы</span>
                <span className="mt-1 block max-w-sm text-base leading-6 text-white">{contacts.workingHours}</span>
              </span>
            </div>
          </div>

          <motion.a
            href={contacts.vkGroup}
            target="_blank"
            rel="noreferrer"
            whileHover={prefersReducedMotion ? undefined : { scale: 1.025 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.975 }}
            className="mt-5 inline-flex min-h-12 items-center gap-3 rounded-full border border-white/15 bg-white/5 px-5 text-sm font-medium text-white backdrop-blur-xl transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80"
          >
            <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-md bg-[#0077FF] text-[0.65rem] font-bold text-white">VK</span>
            Группа клуба
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          </motion.a>
        </motion.div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 32 }}
          whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.08 }}
          className="self-start rounded-[2rem] border border-white/10 bg-zinc-900/50 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl"
        >
          <form id="lead-form" onSubmit={handleSubmit} noValidate className="rounded-[1.55rem] border border-white/[0.07] bg-black/20 p-6 sm:p-8">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-100/75">Быстрая запись</p>
            <h3 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">Мы вам перезвоним</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Обычно связываемся в рабочее время клуба.</p>

            <div className="mt-8 space-y-5">
              <label className="block text-sm text-zinc-300" htmlFor="firstName">
                Имя
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors((current) => ({ ...current, name: undefined }));
                    clearFeedback();
                  }}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  placeholder="Как к вам обратиться"
                  className={inputClassName}
                />
                {errors.name ? <span id="name-error" className="mt-2 block text-xs text-red-300" role="alert">{errors.name}</span> : null}
              </label>

              <label className="block text-sm text-zinc-300" htmlFor="phone">
                Телефон
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  onKeyDown={handlePhoneKeyDown}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'phone-error' : undefined}
                  placeholder="+7 (___) ___-__-__"
                  className={inputClassName}
                />
                {errors.phone ? <span id="phone-error" className="mt-2 block text-xs text-red-300" role="alert">{errors.phone}</span> : null}
              </label>

              <label className="block text-sm text-zinc-300" htmlFor="service">
                Услуга
                <span className="relative mt-2 block">
                  <select
                    id="service"
                    name="service"
                    value={serviceId}
                    onChange={(event) => {
                      setServiceId(event.target.value);
                      setErrors((current) => ({ ...current, service: undefined }));
                      clearFeedback();
                    }}
                    aria-invalid={Boolean(errors.service)}
                    aria-describedby={errors.service ? 'service-error' : undefined}
                    className="min-h-12 w-full appearance-none rounded-2xl border border-white/10 bg-zinc-900 px-4 pr-12 text-base text-white outline-none transition hover:border-white/20 focus:border-amber-100/50 focus:ring-4 focus:ring-amber-100/5"
                  >
                    <option value="">Выберите услугу</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.title} — {service.price}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </span>
                {errors.service ? <span id="service-error" className="mt-2 block text-xs text-red-300" role="alert">{errors.service}</span> : null}
              </label>

              <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label htmlFor="website">Ваш сайт</label>
                <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
              </div>

              <div>
                <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-zinc-400" htmlFor="personal-data-consent">
                  <input
                    ref={consentRef}
                    id="personal-data-consent"
                    name="personalDataConsent"
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(event) => {
                      setConsentAccepted(event.target.checked);
                      setErrors((current) => ({ ...current, consent: undefined }));
                      clearFeedback();
                    }}
                    aria-invalid={Boolean(errors.consent)}
                    aria-describedby={errors.consent ? 'consent-error' : undefined}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 accent-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80"
                  />
                  <span>Я даю согласие на обработку персональных данных для рассмотрения заявки.</span>
                </label>
                {errors.consent ? <span id="consent-error" className="mt-2 block text-xs text-red-300" role="alert">{errors.consent}</span> : null}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.div
                  key="success"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                  className="mt-6 flex min-h-14 items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 text-sm text-emerald-100"
                  role="status"
                >
                  <Check aria-hidden="true" className="h-5 w-5 shrink-0" />
                  Заявка принята. Мы свяжемся с вами.
                </motion.div>
              ) : (
                <motion.button
                  key="submit"
                  type="submit"
                  disabled={status === 'submitting'}
                  whileHover={prefersReducedMotion || status === 'submitting' ? undefined : { scale: 1.015 }}
                  whileTap={prefersReducedMotion || status === 'submitting' ? undefined : { scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-medium text-zinc-950 shadow-xl shadow-black/20 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                >
                  {status === 'submitting' ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                      Отправляем…
                    </>
                  ) : (
                    <>
                      Отправить заявку
                      <Send aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                    </>
                  )}
                </motion.button>
              )}
            </AnimatePresence>

            {submitError ? (
              <p className="mt-3 rounded-xl border border-red-300/15 bg-red-300/[0.07] px-4 py-3 text-sm leading-5 text-red-200" role="alert">
                {submitError}
              </p>
            ) : null}
          </form>
        </motion.div>
      </div>
    </section>
  );
}
