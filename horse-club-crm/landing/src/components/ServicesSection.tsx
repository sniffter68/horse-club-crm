import { ArrowUpRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactElement } from 'react';
import type { ServiceItem } from '../types/content';

interface Props {
  services: ServiceItem[];
}

export function ServicesSection({ services }: Props): ReactElement {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {services.map((service, index) => (
        <motion.article
          key={service.id}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
          whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          whileHover={prefersReducedMotion ? undefined : { y: -6 }}
          viewport={{ once: true, amount: 0.18 }}
          transition={{ type: 'spring', stiffness: 120, damping: 20, delay: index * 0.05 }}
          className="group flex min-h-[21rem] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-900/40 shadow-2xl shadow-black/10 backdrop-blur-xl"
        >
          <div className="relative h-36 overflow-hidden">
            <img
              src={service.imageUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="h-full w-full object-cover opacity-70 transition duration-700 ease-out group-hover:scale-105 group-hover:opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
            <span className="absolute left-5 top-5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-white backdrop-blur-xl">
              {service.category}
            </span>
          </div>

          <div className="flex flex-1 flex-col px-6 pb-6 pt-3 sm:px-7 sm:pb-7">
            <h3 className="text-2xl font-medium leading-tight tracking-tight text-white">{service.title}</h3>
            <p className="mt-4 text-sm leading-6 text-zinc-400">{service.description}</p>

            <div className="mt-auto flex items-end justify-between gap-4 border-t border-white/10 pt-6">
              <div>
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-zinc-500">Стоимость</p>
                <p className="mt-1.5 text-base font-medium tracking-tight text-amber-100">{service.price}</p>
              </div>
              <motion.a
                href="#contacts"
                whileHover={prefersReducedMotion ? undefined : { scale: 1.04 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-sm font-medium text-white transition-colors hover:bg-white hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80"
              >
                Выбрать
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              </motion.a>
            </div>
          </div>
        </motion.article>
      ))}
    </div>
  );
}
