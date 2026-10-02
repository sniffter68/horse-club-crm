import { HeroSection } from './components/HeroSection';
import { InfrastructureSection } from './components/InfrastructureSection';
import { Navbar } from './components/Navbar';
import { SmoothScroll } from './components/SmoothScroll';
import { landingData } from './data/landingContent';
import type { ReactElement } from 'react';

export default function App(): ReactElement {
  const { brand, navigation, hero, infrastructureSection, infrastructure } = landingData;

  return (
    <SmoothScroll>
      <Navbar brandName={brand.name} logoUrl={brand.logoUrl} items={navigation} />
      <main>
        <HeroSection content={hero} />
        <section id="infrastructure" className="relative overflow-hidden bg-[#0B0C0E] px-6 py-24 sm:px-10 sm:py-32 lg:px-12">
          <div aria-hidden="true" className="absolute left-1/2 top-0 h-px w-[72%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 grid gap-6 lg:mb-16 lg:grid-cols-[minmax(0,1fr)_30rem] lg:items-end">
              <div>
                <p className="mb-5 text-xs font-medium uppercase tracking-[0.24em] text-amber-100/75">{infrastructureSection.eyebrow}</p>
                <h2 className="max-w-4xl text-balance text-4xl font-light leading-tight tracking-[-0.04em] text-white sm:text-6xl">
                  {infrastructureSection.title}
                </h2>
              </div>
              <p className="max-w-xl text-pretty text-base leading-7 text-zinc-400 lg:justify-self-end">
                {infrastructureSection.description}
              </p>
            </div>
            <InfrastructureSection cards={infrastructure} />
          </div>
        </section>
        <div id="services" aria-hidden="true" />
        <div id="horses" aria-hidden="true" />
        <div id="contact" aria-hidden="true" />
      </main>
    </SmoothScroll>
  );
}
