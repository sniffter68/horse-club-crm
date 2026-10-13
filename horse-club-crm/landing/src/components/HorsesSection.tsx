import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import type { HorseCard } from '../data/landingContent';

interface HorsesSectionProps {
  horses: HorseCard[];
}

export function HorsesSection({ horses }: HorsesSectionProps): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {horses.map((horse, idx) => (
        <motion.article
          key={horse.id}
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{
            duration: 0.7,
            delay: idx * 0.15,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="group overflow-hidden rounded-3xl border border-luxury-border bg-white p-5 shadow-luxury transition-all duration-300 hover:-translate-y-1 hover:shadow-luxury-hover"
        >
          {/* Портрет лошади */}
          <div className="relative mb-5 aspect-[4/3] w-full overflow-hidden rounded-2xl bg-luxury-surface border border-luxury-border/50">
            <img
              src={horse.imageUrl}
              alt={horse.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          </div>

          {/* Инфо */}
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xl font-light tracking-tight text-luxury-dark">
              {horse.name}
            </h3>
            <span className="text-xs font-medium text-luxury-muted">
              {horse.breed}
            </span>
          </div>

          <p className="mt-2 text-xs font-normal uppercase tracking-wider text-luxury-muted/90">
            {horse.role}
          </p>
        </motion.article>
      ))}
    </div>
  );
}