import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import type { InfrastructureCard } from '../data/landingContent';

interface InfrastructureSectionProps {
  cards: InfrastructureCard[];
}

export function InfrastructureSection({ cards }: InfrastructureSectionProps): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card, idx) => (
        <motion.article
          key={card.id}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{
            duration: 0.7,
            delay: idx * 0.15,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-luxury-border bg-luxury-card p-6 shadow-luxury transition-all duration-300 hover:shadow-luxury-hover hover:-translate-y-1"
        >
          <div>
            {/* Медиа контейнер со скруглением */}
            <div className="relative mb-6 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-luxury-surface border border-luxury-border/60">
              <img
                src={card.imageUrl}
                alt={card.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <span className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-luxury-dark backdrop-blur-md shadow-sm border border-luxury-border/40">
                {card.badge}
              </span>
            </div>

            {/* Заголовок и описание */}
            <h3 className="mb-3 text-2xl font-light tracking-tight text-luxury-dark">
              {card.title}
            </h3>
            <p className="text-sm leading-relaxed text-luxury-muted">
              {card.description}
            </p>
          </div>

          {/* Спецификации / характеристики */}
          <div className="mt-8 border-t border-luxury-divider pt-5">
            <dl className="grid grid-cols-3 gap-2">
              {card.specs.map((spec, sIdx) => (
                <div key={sIdx} className="flex flex-col">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-luxury-muted">
                    {spec.label}
                  </dt>
                  <dd className="mt-1 text-xs font-medium text-luxury-dark line-clamp-1">
                    {spec.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </motion.article>
      ))}
    </div>
  );
}