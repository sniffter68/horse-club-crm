import { useEffect, type ReactElement, type ReactNode } from 'react';
import Lenis from '@studio-freight/lenis';

interface Props {
  children: ReactNode;
}

export function SmoothScroll({ children }: Props): ReactElement {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.2,
    });

    let animationFrameId = 0;

    const frame = (time: number): void => {
      lenis.raf(time);
      animationFrameId = window.requestAnimationFrame(frame);
    };

    animationFrameId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      lenis.destroy();
    };
  }, []);

  return <div className="min-h-screen bg-[#0B0C0E] text-white">{children}</div>;
}
