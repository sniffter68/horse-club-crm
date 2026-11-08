import { useEffect, useState, type ReactElement } from 'react';
import { ChevronUp } from 'lucide-react';

export function ScrollToTop(): ReactElement {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 300);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };

  return (
    <button
      type="button"
      aria-label="Вернуться наверх"
      aria-hidden={!visible}
      disabled={!visible}
      onClick={scrollToTop}
      className={`fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-club-deep text-club-paper shadow-lg transition-opacity duration-200 hover:bg-club-action active:bg-club-ink focus:outline-none focus:ring-2 focus:ring-club-action focus:ring-offset-2 motion-reduce:transition-none md:right-8 lg:bottom-8 ${visible ? 'cursor-pointer opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <ChevronUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
