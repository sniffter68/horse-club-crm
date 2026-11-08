import { Children, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CarouselProps {
  children: ReactNode;
  label: string;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  dots?: boolean;
  ordered?: boolean;
  nativeMobile?: boolean;
}

/** Shared touch/keyboard carousel. Card appearance belongs to each section. */
export function Carousel({ children, label, initialIndex = 0, onIndexChange, dots = true, ordered = false, nativeMobile = false }: CarouselProps) {
  const reducedMotion = useReducedMotion();
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  const native = nativeMobile && narrow;
  const nativeViewport = useRef<HTMLDivElement | null>(null);
  const position = useRef(initialIndex);
  // Carry the current position across the native/Embla breakpoint without reinitializing on every slide.
  const startIndex = useMemo(() => position.current, [native]);
  const [viewportRef, api] = useEmblaCarousel({ active: !native, align: 'start', containScroll: 'trimSnaps', startIndex });
  const [selected, setSelected] = useState(initialIndex);
  const [snaps, setSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const viewportId = useId();
  const items = Children.toArray(children);
  const List = ordered ? 'ol' : 'ul';
  const attachViewport = useCallback((element: HTMLDivElement | null) => {
    nativeViewport.current = element;
    viewportRef(element);
  }, [viewportRef]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const viewport = nativeViewport.current;
    if (!native || !viewport) return;
    const slides = Array.from(viewport.querySelectorAll<HTMLElement>('.club-carousel__slide'));
    const measure = () => {
      const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const start = slides[0]?.offsetLeft ?? 0;
      const positions = [...new Set(slides.map(slide => Math.min(slide.offsetLeft - start, max)))];
      setSnaps(positions);
      return positions;
    };
    const syncNative = () => {
      const positions = measure();
      const index = positions.reduce((closest, position, i) => Math.abs(position - viewport.scrollLeft) < Math.abs(positions[closest] - viewport.scrollLeft) ? i : closest, 0);
      position.current = index;
      setSelected(index);
      setCanPrev(index > 0);
      setCanNext(index < positions.length - 1);
      onIndexChange?.(index);
    };
    viewport.scrollLeft = measure()[position.current] ?? 0;
    syncNative();
    viewport.addEventListener('scroll', syncNative, { passive: true });
    const observer = new ResizeObserver(syncNative);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener('scroll', syncNative);
      observer.disconnect();
      viewport.scrollLeft = 0;
    };
  }, [native, initialIndex, onIndexChange, children]);

  const sync = useCallback(() => {
    if (!api || native) return;
    const index = api.selectedScrollSnap();
    position.current = index;
    setSelected(index);
    setSnaps(api.scrollSnapList());
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
    onIndexChange?.(index);
  }, [api, native, onIndexChange]);

  useEffect(() => {
    if (!api) return;
    sync();
    api.on('select', sync).on('reInit', sync);
    return () => { api.off('select', sync).off('reInit', sync); };
  }, [api, sync]);

  const go = (index: number) => {
    if (native) nativeViewport.current?.scrollTo({ left: snaps[Math.max(0, Math.min(index, snaps.length - 1))] ?? 0, behavior: reducedMotion ? 'instant' : 'smooth' });
    else api?.scrollTo(index, !!reducedMotion);
  };

  return (
    <div className="club-carousel" role="region" aria-roledescription="карусель" aria-label={label}>
      <div id={viewportId} ref={attachViewport} className={`club-carousel__viewport${native ? ' club-carousel__viewport--native snap-x snap-mandatory overflow-x-auto pb-4' : ''}`}
        tabIndex={0} aria-label={`${label}: используйте стрелки влево и вправо`}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowLeft') { event.preventDefault(); go(selected - 1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); go(selected + 1); }
          if (event.key === 'Home') { event.preventDefault(); go(0); }
          if (event.key === 'End') { event.preventDefault(); go(snaps.length - 1); }
        }}>
        <List className={`club-carousel__track${native ? ' flex gap-4' : ''}`} role="list">
          {items.map((child, index) => (
            <li key={index} className={`club-carousel__slide${native ? ' snap-start' : ''}`} aria-label={`${index + 1} из ${items.length}`}>
              {child}
            </li>
          ))}
        </List>
      </div>
      {snaps.length > 1 && (
        <div className="club-carousel__controls">
          <button type="button" className="club-carousel__arrow" aria-label="Влево" aria-controls={viewportId}
            disabled={!canPrev} onClick={() => go(selected - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
          {dots && <div className="club-carousel__dots" role="group" aria-label="Выбор слайда">
            {snaps.map((_, index) => <button key={index} type="button" className="club-carousel__dot"
              aria-label={`К слайду ${index + 1}`} aria-current={selected === index ? 'true' : undefined}
              aria-controls={viewportId} onClick={() => go(index)}><span /></button>)}
          </div>}
          <p className="sr-only" aria-live="polite" aria-atomic="true">Позиция {selected + 1} из {snaps.length}</p>
          <button type="button" className="club-carousel__arrow" aria-label="Вправо" aria-controls={viewportId}
            disabled={!canNext} onClick={() => go(selected + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
      )}
    </div>
  );
}
