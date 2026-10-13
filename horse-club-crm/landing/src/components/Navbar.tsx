import { useRef, useState } from 'react';
import { ModalDialog } from './ModalDialog';

const links = [
  { label: 'Услуги', href: '#services' }, { label: 'Лошади и тренеры', href: '#horses-trainers' },
  { label: 'О клубе', href: '#about' }, { label: 'Контакты', href: '#contacts' },
];
export function Navbar() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); toggle.current?.focus({ preventScroll: true }); }
  return <>
    <header className="fixed inset-x-0 top-4 z-40 px-4 sm:px-8">
      <nav aria-label="Основная навигация" className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-full border border-black/10 bg-[#FAF7F2]/95 px-3 py-2 text-[#3A2F2B] shadow-lg backdrop-blur-lg sm:px-5">
        <a href="#hero" className="flex items-center gap-2 font-serif text-base">
          <img src="/images/slks-logo.webp" alt="" width={36} height={36} decoding="async" className="h-9 w-9 rounded-full bg-[#3A2F2B] object-contain" />
          <span>СЛКС Тамбов</span>
        </a>
        <div className="hidden items-center gap-6 text-sm lg:flex">
          {links.map(link => <a key={link.href} href={link.href} className="hover:underline">{link.label}</a>)}
          <a href="#contacts" className="catalog-cta">Записаться</a>
        </div>
        <button ref={toggle} type="button" className="h-11 rounded-full border border-[#D8C8BB] px-3 text-sm hover:bg-[#E4DAD0] lg:hidden"
          aria-expanded={open} aria-label="Открыть меню" onClick={() => setOpen(true)}>Меню</button>
      </nav>
    </header>
    {open && <ModalDialog className="navigation-dialog" label="Меню сайта" onClose={close}>
      <button type="button" className="dialog-close" autoFocus aria-label="Закрыть меню" onClick={close}>×</button>
      <nav aria-label="Навигация в меню">
        {links.map(link => <a key={link.href} href={link.href} onClick={close}>{link.label}</a>)}
        <a href="#contacts" className="catalog-cta mt-5" onClick={close}>Записаться</a>
      </nav>
    </ModalDialog>}
  </>;
}
