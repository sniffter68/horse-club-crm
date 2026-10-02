import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef, type ReactElement } from 'react';
import type { HeroContent } from '../types/content';

interface Props {
  content: HeroContent;
}

export function HeroSection({ content }: Props): ReactElement {
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1, prefersReducedMotion ? 1 : 0.9]);
  const opacity = useTransform(scrollYProgress, [0, 0.82], [1, prefersReducedMotion ? 1 : 0]);
  const y = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : 100]);

  return (
    <section ref={sectionRef} id="top" className="relative h-screen min-h-[680px] overflow-hidden bg-[#0B0C0E]">
      <img
        src={content.mediaUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,12,14,0.35)_0%,rgba(11,12,14,0.2)_42%,rgba(11,12,14,0.92)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,transparent_0%,rgba(11,12,14,0.26)_46%,rgba(11,12,14,0.76)_100%)]" />

      <motion.div
        style={{ scale, opacity, y }}
        className="relative mx-auto flex h-full max-w-7xl origin-center items-end px-6 pb-12 pt-32 sm:px-10 sm:pb-16 lg:px-12 lg:pb-20"
      >
        <div className="grid w-full items-end gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <p className="mb-6 flex items-center gap-3 text-[0.68rem] font-medium uppercase tracking-[0.24em] text-zinc-200 sm:text-xs">
              <span className="h-px w-8 bg-amber-100/70" />
              {content.tagline}
            </p>
            <h1 className="max-w-5xl text-balance text-5xl font-light leading-[0.92] tracking-[-0.055em] text-white sm:text-7xl lg:text-[7.25rem]">
              {content.title}
            </h1>
          </div>

          <div className="lg:pb-2">
            <p className="max-w-xl text-pretty text-base leading-7 text-zinc-200 sm:text-lg">{content.subtitle}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#contacts"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition-transform hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                {content.primaryCtaText}
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </a>
              <a
                href="#infrastructure"
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                {content.secondaryCtaText}
                <ArrowDown aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
