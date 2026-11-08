import type { ReactElement } from 'react';
import { legal } from '../legal';
import { PrivacyPolicyLink } from './PrivacyPolicyLink';

export function Footer({ brandName }: { brandName: string }): ReactElement {
  const year = new Intl.DateTimeFormat('ru-RU', { year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date());
  return <footer className="border-t border-white/10 bg-luxury-deep px-6 py-8 text-sm text-luxury-bg">
    <div className="mx-auto max-w-7xl space-y-3">
      <p>© {year} {brandName}. Все права защищены.</p>
      <p>{legal.operatorName}</p>
      <p>{legal.registration}</p>
      <p>{legal.operatorAddress}</p>
      <div className="flex flex-wrap items-center gap-x-6">
        <PrivacyPolicyLink>Политика обработки персональных данных</PrivacyPolicyLink>
        <a className="inline-flex min-h-11 items-center underline hover:text-white" href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>
        <a className="inline-flex min-h-11 items-center hover:text-white" href="#contacts">Контакты</a>
      </div>
    </div>
  </footer>;
}
