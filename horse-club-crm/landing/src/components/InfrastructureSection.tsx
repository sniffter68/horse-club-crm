import { ArrowUpRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactElement } from 'react';
import type { FeatureCard } from '../types/content';

interface Props {
  cards: FeatureCard[];
}

export function InfrastructureSection({ cards }: Props): ReactElement {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {cards.map((card, index) => (
        <motion.article
          key={card.id}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 32 }}
          whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ type: 'spring', stiffness: 80, damping: 18, delay: index * 0.08 }}
          className={`group relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-900/40 p-2 shadow-2xl shadow-black/10 backdrop-blur-sm ${
            index === 0 ? 'lg:col-span-7' : index === 1 ? 'lg:col-span-5' : 'lg:col-span-12'
          }`}
        >
          <div className={`relative overflow-hidden rounded-[1.55rem] ${index === 2 ? 'aspect-[16/8] lg:aspect-[16/5]' : 'aspect-[4/3]'}`}>
            <img
              src={card.imageUrl}
              alt={card.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/10" />
            <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-white backdrop-blur-xl">
              {card.badge}
            </span>
            <ArrowUpRight
              aria-hidden="true"
              className="absolute right-5 top-5 h-5 w-5 text-white/80 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              strokeWidth={1.5}
            />
          </div>

          <div className="p-5 sm:p-7">
            <h3 className="text-2xl font-medium tracking-tight text-white sm:text-3xl">{card.title}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">{card.description}</p>

            <dl className="mt-8 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
              {card.specs.map((spec) => (
                <div key={`${card.id}-${spec.label}`} className="min-w-0">
                  <dt className="truncate text-[0.62rem] uppercase tracking-[0.16em] text-zinc-500">{spec.label}</dt>
                  <dd className="mt-2 text-sm font-medium text-zinc-100 sm:text-base">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </motion.article>
      ))}
    </div>
  );
}
