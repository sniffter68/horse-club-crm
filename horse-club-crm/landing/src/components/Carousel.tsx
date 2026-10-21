import { Children, useCallback, useEffect, useId, useState, type ReactNode } from 'react';
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
}

/** Shared touch/keyboard carousel. Card appearance belongs to each section. */
export function Carousel({ children, label, initialIndex = 0, onIndexChange, dots = true, ordered = false }: CarouselProps) {
  const reducedMotion = useReducedMotion();
  const [viewportRef, api] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps', startIndex: initialIndex });
  const [selected, setSelected] = useState(initialIndex);
  const [snaps, setSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const viewportId = useId();
  const items = Children.toArray(children);
  const List = ordered ? 'ol' : 'ul';

  const sync = useCallback(() => {
    if (!api) return;
    const index = api.selectedScrollSnap();
    setSelected(index);
    setSnaps(api.scrollSnapList());
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
    onIndexChange?.(index);
  }, [api, onIndexChange]);

  useEffect(() => {
    if (!api) return;
    sync();
    api.on('select', sync).on('reInit', sync);
    return () => { api.off('select', sync).off('reInit', sync); };
  }, [api, sync]);

  const go = (index: number) => api?.scrollTo(index, !!reducedMotion);

  return (
    <div className="club-carousel" role="region" aria-roledescription="карусель" aria-label={label}>
      <div id={viewportId} ref={viewportRef} className="club-carousel__viewport"
        tabIndex={0} aria-label={`${label}: используйте стрелки влево и вправо`}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowLeft') { event.preventDefault(); go(selected - 1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); go(selected + 1); }
          if (event.key === 'Home') { event.preventDefault(); go(0); }
          if (event.key === 'End') { event.preventDefault(); go(snaps.length - 1); }
        }}>
        <List className="club-carousel__track" role="list">
          {items.map((child, index) => (
            <li key={index} className="club-carousel__slide" aria-label={`${index + 1} из ${items.length}`}>
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
