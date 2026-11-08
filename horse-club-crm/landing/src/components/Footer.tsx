import type { MouseEvent, ReactElement } from 'react';
import { landingData } from '../data/landingContent';
import { handleCatalogImageError } from '../catalogImage';
import { legal } from '../legal';
import { PrivacyPolicyLink } from './PrivacyPolicyLink';

const navigation = [
  { label: 'О клубе', href: '#about' },
  { label: 'Услуги клуба', href: '#services' },
  { label: 'Лошади', href: '#horses' },
  { label: 'Тренеры', href: '#coaches' },
  { label: 'Подготовка к визиту', href: '#preparation' },
  { label: 'Отзывы', href: '#reviews' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Онлайн-запись', href: '#booking' },
  { label: 'Контакты', href: '#contacts' },
];

function scrollToSection(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = document.getElementById(event.currentTarget.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
  });
}

export function Footer({ brandName }: { brandName: string }): ReactElement {
  return <footer className="club-footer border-t border-club-ink/15 bg-club-sand px-6 py-10 text-sm leading-relaxed text-club-secondary sm:px-10 md:py-14 lg:px-16">
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.2fr_0.85fr_1fr_1.2fr_1fr]">
      <div className="flex min-w-0 flex-col items-start">
        <a href="#hero" onClick={scrollToSection} className="inline-flex min-h-11 items-center gap-3 font-serif text-lg text-club-ink" aria-label={`${brandName} — на главную`}>
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-club-ink">
            <img src={landingData.brand.logoUrl} onError={handleCatalogImageError} alt="" width={48} height={48} className="h-12 w-12 object-contain" />
          </span>
          {brandName}
        </a>
        <p className="mt-4 max-w-60">КСК «Союз любителей конного спорта»</p>
        <p className="mt-6 xl:mt-auto xl:pt-8">© КСК «СЛКС». Все права защищены.</p>
      </div>
      <nav aria-labelledby="footer-navigation" className="min-w-0">
        <h4 id="footer-navigation" className="mb-3 font-serif text-lg font-normal text-club-ink">Навигация:</h4>
        <ul>{navigation.map(item => <li key={item.href}><a href={item.href} onClick={scrollToSection}
          target={item.href.startsWith('#') ? undefined : '_blank'}
          rel={item.href.startsWith('#') ? undefined : 'noopener noreferrer'}>{item.label}</a></li>)}</ul>
      </nav>
      <section aria-labelledby="footer-contacts" className="min-w-0">
        <h4 id="footer-contacts" className="mb-3 font-serif text-lg font-normal text-club-ink">Контакты:</h4>
        <ul>
          <li><a href="tel:+79156720030" className="whitespace-nowrap">+7 (915) 672-00-30</a></li>
          <li><a href={landingData.contacts.vkGroup} target="_blank" rel="noopener noreferrer">ВКонтакте</a></li>
          <li><a href={landingData.contacts.max} target="_blank" rel="noopener noreferrer">MAX</a></li>
        </ul>
      </section>
      <section aria-labelledby="footer-address" className="min-w-0">
        <h4 id="footer-address" className="mb-3 font-serif text-lg font-normal text-club-ink">Наш адрес:</h4>
        <address className="not-italic">г. Тамбов, ул. Бастионная, 22АС2.</address>
        <p className="mt-4">Ежедневно с 09:00 до 19:00<br />(по предварительной записи)</p>
        <a href="https://yandex.ru/maps/?text=Тамбов+ул+Бастионная+22АС2" target="_blank" rel="noopener noreferrer" className="mt-3 underline underline-offset-4">Смотреть карту</a>
      </section>
      <section aria-labelledby="footer-clients" className="min-w-0">
        <h4 id="footer-clients" className="mb-3 font-serif text-lg font-normal text-club-ink">Для клиентов:</h4>
        <ul>
          <li><PrivacyPolicyLink>Политика конфиденциальности</PrivacyPolicyLink></li>
          <li><a href="#preparation" onClick={scrollToSection}>Правила посещения клуба и техника безопасности</a></li>
        </ul>
        <div className="mt-5 space-y-1">
          <p>{legal.operatorName}</p><p>{legal.registration}</p><p>{legal.operatorAddress}</p>
          <a href={`mailto:${legal.privacyEmail}`} className="break-all">{legal.privacyEmail}</a>
        </div>
      </section>
    </div>
  </footer>;
}
