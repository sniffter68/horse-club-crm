import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import type { TrainerCard } from '../data/landingContent';

interface TrainersSectionProps {
  trainers: TrainerCard[];
}

export function TrainersSection({ trainers }: TrainersSectionProps): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {trainers.map((trainer, idx) => (
        <motion.article
          key={trainer.id}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{
            duration: 0.75,
            delay: idx * 0.18,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="group overflow-hidden rounded-3xl border border-luxury-border bg-white p-6 shadow-luxury transition-all duration-300 hover:-translate-y-1 hover:shadow-luxury-hover"
        >
          {/* Портрет тренера */}
          <div className="relative mb-5 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-luxury-surface border border-luxury-border/50">
            <img
              src={trainer.imageUrl}
              alt={trainer.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          </div>

          {/* Инфо */}
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xl font-light tracking-tight text-luxury-dark">
                {trainer.name}
              </h3>
              <span className="text-xs font-medium text-luxury-muted">
                {trainer.experience}
              </span>
            </div>
            <p className="text-sm text-luxury-muted">
              {trainer.role}
            </p>
          </div>
        </motion.article>
      ))}
    </div>
  );
}