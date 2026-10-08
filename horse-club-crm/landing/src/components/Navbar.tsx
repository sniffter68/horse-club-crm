import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface NavigationItem {
  label: string;
  href: string;
}

const navigationItems: NavigationItem[] = [
  { label: 'Услуги', href: '#services' },
  { label: 'Лошади и тренеры', href: '#horses-trainers' },
  { label: 'О клубе', href: '#about' },
  { label: 'Контакты', href: '#contacts' },
];

interface BrandProps {
  inverse?: boolean;
}

function Brand({ inverse = false }: BrandProps): ReactElement {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border ${
          inverse ? 'border-white/15 bg-white/10' : 'border-black/10 bg-[#3A2F2B]'
        }`}
      >
        <img
          src="/images/slks-logo-transparent.png"
          alt=""
          aria-hidden="true"
          className="h-8 w-8 object-contain"
        />
      </span>
      <span
        className={`truncate font-serif text-base tracking-normal ${
          inverse ? 'text-[#E4DAD0]' : 'text-[#3A2F2B]'
        }`}
      >
        СЛКС Тамбов
      </span>
    </span>
  );
}

export function Navbar(): ReactElement {
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = (): void => {
      setIsScrolled(window.scrollY > 90);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    menuRef.current?.querySelector<HTMLAnchorElement>('a[href]')?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        toggleButtonRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab' || menuRef.current === null) {
        return;
      }

      const focusableElements = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleNavigation = (event: MouseEvent<HTMLAnchorElement>, href: string): void => {
    event.preventDefault();
    setIsOpen(false);

    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(href);
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  };

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-4 z-[70] px-4 sm:px-8 md:top-5">
        <div className="mx-auto max-w-7xl">
          <nav
            aria-label="Мобильная навигация"
            className="pointer-events-auto flex w-full items-center justify-between rounded-full border border-white/10 bg-[#241E1C]/95 px-3 py-2 shadow-[0_16px_40px_rgba(36,30,28,0.22)] backdrop-blur-xl md:hidden"
          >
            <a href="#hero" onClick={(event) => handleNavigation(event, '#hero')}>
              <Brand inverse />
            </a>

            <motion.button
              type="button"
              onClick={(event) => {
                toggleButtonRef.current = event.currentTarget;
                setIsOpen((current) => !current);
              }}
              whileTap={{ scale: 0.92 }}
              aria-expanded={isOpen}
              aria-controls="mobile-navigation-drawer"
              aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-[#E4DAD0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E4DAD0]"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 16h14" />
                )}
              </svg>
            </motion.button>
          </nav>

          <div className="hidden items-center justify-center md:flex">
            <AnimatePresence mode="wait">
              {!isScrolled ? (
                <motion.nav
                  key="desktop-navigation"
                  aria-label="Основная навигация"
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-auto flex items-center gap-8 rounded-full border border-black/10 bg-white/85 px-4 py-2 shadow-lg backdrop-blur-xl lg:gap-10"
                >
                  <a href="#hero" className="flex items-center" onClick={(event) => handleNavigation(event, '#hero')}>
                    <Brand />
                  </a>

                  <div className="flex items-center gap-5 text-[11px] uppercase tracking-[0.14em] text-[#6E645F] lg:gap-6">
                    {navigationItems.map((item) => (
                      <a key={item.href} href={item.href} className="transition-colors hover:text-[#3A2F2B]">
                        {item.label}
                      </a>
                    ))}
                  </div>

                  <a
                    href="#contacts"
                    className="rounded-full bg-[#3A2F2B] px-5 py-2.5 text-xs font-medium text-white shadow-sm transition-all hover:scale-105 hover:bg-[#724C39] active:scale-95"
                  >
                    Записаться ↗
                  </a>
                </motion.nav>
              ) : (
                <motion.button
                  key="desktop-menu-button"
                  type="button"
                  initial={{ opacity: 0, scale: 0.75 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.75 }}
                  onClick={(event) => {
                    toggleButtonRef.current = event.currentTarget;
                    setIsOpen((current) => !current);
                  }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  aria-expanded={isOpen}
                  aria-controls="mobile-navigation-drawer"
                  aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
                  className="pointer-events-auto ml-auto grid h-12 w-12 place-items-center rounded-full border border-black/10 bg-white/95 text-[#3A2F2B] shadow-xl backdrop-blur-xl"
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    {isOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 16h14" />
                    )}
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="mobile-navigation-drawer"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Меню сайта"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[60] overflow-y-auto bg-[#241E1C]/95 px-5 pb-8 pt-28 text-[#E4DAD0] backdrop-blur-2xl sm:px-8"
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 180, damping: 24 }}
              className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-2xl flex-col justify-between"
            >
              <div className="flex flex-col">
                <p className="mb-7 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#E4DAD0]/55">
                  Навигация
                </p>
                {navigationItems.map((item, index) => (
                  <motion.a
                    key={item.href}
                    href={item.href}
                    onClick={(event) => handleNavigation(event, item.href)}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * index, type: 'spring', stiffness: 180, damping: 22 }}
                    className="border-b border-white/10 py-5 font-serif text-3xl tracking-tight transition-colors hover:text-white focus-visible:outline-none focus-visible:text-white sm:text-4xl"
                  >
                    {item.label}
                  </motion.a>
                ))}
              </div>

              <motion.a
                href="#contacts"
                onClick={(event) => handleNavigation(event, '#contacts')}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                className="mt-10 flex min-h-14 w-full items-center justify-between rounded-2xl bg-[#E4DAD0] px-6 text-sm font-semibold uppercase tracking-[0.12em] text-[#241E1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>Записаться</span>
                <span aria-hidden="true">↗</span>
              </motion.a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
