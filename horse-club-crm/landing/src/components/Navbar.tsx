import { ArrowUpRight } from 'lucide-react';
import type { ReactElement } from 'react';
import type { NavItem } from '../types/content';

interface Props {
  brandName: string;
  logoUrl: string;
  items: NavItem[];
}

export function Navbar({ brandName, logoUrl, items }: Props): ReactElement {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-6 z-50 px-4">
      <nav
        aria-label={`Основная навигация ${brandName}`}
        className="pointer-events-auto mx-auto flex w-fit max-w-full items-center gap-1 rounded-full border border-white/10 bg-zinc-950/60 p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl"
      >
        <a
          href="#top"
          aria-label={`${brandName} — на главную`}
          className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium tracking-tight text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 sm:px-4"
        >
          <img
            src={logoUrl}
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-[0.6rem] object-cover ring-1 ring-white/10"
          />
          <span className="hidden max-w-36 truncate sm:inline">{brandName}</span>
        </a>

        <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/10" />

        <div className="flex items-center">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className="hidden min-h-11 items-center rounded-full px-4 text-sm text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 md:flex"
            >
              {item.label}
            </a>
          ))}
          {items.at(-1) ? (
            <a
              href={items.at(-1)?.href}
              aria-label={items.at(-1)?.label}
              className="ml-1 flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-zinc-950 transition-transform hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <span className="hidden sm:inline">{items.at(-1)?.label}</span>
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </a>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
