import { usePublicContent } from './usePublicContent';
import { useState, type ReactElement } from 'react';
import { firstLesson, scrollToBooking, type BookingSelection, type ChooseBooking } from './booking';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ServicesSection } from './components/ServicesSection';
import { HorsesAndTrainersSection } from './components/HorsesAndTrainersSection';
import { ClubStandardsSection } from './components/ClubStandardsSection';
import { FirstLessonSection } from './components/FirstLessonSection';
import { GiftCertificatesSection } from './components/GiftCertificatesSection';
import { ContactsSection } from './components/ContactsSection';

export default function App(): ReactElement {
  const content = usePublicContent();
  const [selection, setSelection] = useState<BookingSelection>({});
  const choose: ChooseBooking = (kind, choice) => {
    setSelection(previous => ({ ...previous, [kind]: choice }));
    scrollToBooking();
  };
  const bookFirstLesson = () => choose('service', { ...firstLesson });
  return (
    <div className="landing-shell min-h-screen bg-luxury-bg text-luxury-dark selection:bg-luxury-dark selection:text-luxury-bg antialiased">
      {/* Умная навигационная капсула (сворачивается в бургер при скролле) */}
      <Navbar onBookFirstLesson={bookFirstLesson} />

      <main>
        {/* 1. Секция Hero с кинематографичным взмыванием всадника */}
        <HeroSection onBookFirstLesson={bookFirstLesson} />

        {/* 2. Тёмная секция услуг с интерактивными парящими предметами */}
        <ServicesSection services={content.services} onChoose={choose} />

        {/* 3. Каталог лошадей и тренеров с модальными окнами */}
        <HorsesAndTrainersSection horses={content.horses} trainers={content.trainers} onChoose={choose} />

        {/* 4. Блок "Стандарты клуба" (архитектура, еврогрунт, гуманный тренинг) */}
        <ClubStandardsSection onChoose={choose} />

        <FirstLessonSection onBookFirstLesson={bookFirstLesson} />
        <GiftCertificatesSection />

        {/* 5. Премиальный блок контактов с интерактивной формой бронирования */}
        <ContactsSection services={content.services} selection={selection}
          onChoose={(kind, choice) => setSelection(previous => ({ ...previous, [kind]: choice }))}
          onRemove={kind => setSelection(previous => ({ ...previous, [kind]: undefined }))}
          onReset={() => setSelection({})} />
      </main>

      {/* Футер */}
      <footer className="border-t border-white/10 bg-luxury-deep px-6 py-8 text-center text-sm text-luxury-bg">
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
