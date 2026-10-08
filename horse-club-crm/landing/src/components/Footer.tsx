import type { ReactElement } from 'react';

interface FooterProps {
  brandName: string;
}

export function Footer({ brandName }: FooterProps): ReactElement {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-luxury-border bg-luxury-bg px-6 py-12 sm:px-10 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-luxury-dark text-[11px] font-semibold tracking-wider text-luxury-bg">
            СЛ
          </span>
          <span className="text-sm font-semibold tracking-tight text-luxury-dark">
            {brandName}
          </span>
        </div>

        <p className="text-xs text-luxury-muted">
          © {currentYear} {brandName}. Все права защищены.
        </p>

        <div className="flex items-center gap-6 text-xs text-luxury-muted">
          <a
            href="#contacts"
            className="transition-colors hover:text-luxury-dark"
          >
            Политика конфиденциальности
          </a>
          <a
            href="#contacts"
            className="transition-colors hover:text-luxury-dark"
          >
            Правила посещения
          </a>
        </div>
      </div>
    </footer>
  );
}