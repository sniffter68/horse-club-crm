import type { ReactElement } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ServicesSection } from './components/ServicesSection';
import { HorsesAndTrainersSection } from './components/HorsesAndTrainersSection';
import { ClubStandardsSection } from './components/ClubStandardsSection';
import { ContactsSection } from './components/ContactsSection';

export default function App(): ReactElement {
  return (
    <div className="min-h-screen bg-[#E4DAD0] text-[#3A2F2B] selection:bg-[#3A2F2B] selection:text-[#E4DAD0] antialiased">
      {/* Умная навигационная капсула (сворачивается в бургер при скролле) */}
      <Navbar />

      <main>
        {/* 1. Секция Hero с кинематографичным взмыванием всадника */}
        <HeroSection />

        {/* 2. Тёмная секция услуг с интерактивными парящими предметами */}
        <ServicesSection />

        {/* 3. Каталог лошадей и тренеров с модальными окнами */}
        <HorsesAndTrainersSection />

        {/* 4. Блок "Стандарты клуба" (архитектура, еврогрунт, гуманный тренинг) */}
        <ClubStandardsSection />

        {/* 5. Премиальный блок контактов с интерактивной формой бронирования */}
        <ContactsSection />
      </main>

      {/* Футер */}
      <footer className="border-t border-white/10 bg-[#1D1817] px-6 py-8 text-center text-xs text-[#8C7E77]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p>© 2026 СЛКС Тамбов. Конный клуб и спортивная школа верховой езды.</p>
          <div className="flex items-center gap-6">
            <a href="#services" className="transition-colors hover:text-white">
              Услуги
            </a>
            <a href="#horses-trainers" className="transition-colors hover:text-white">
              Лошади
            </a>
            <a href="#about" className="transition-colors hover:text-white">
              Стандарты
            </a>
            <a href="#contacts" className="transition-colors hover:text-white">
              Контакты
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}