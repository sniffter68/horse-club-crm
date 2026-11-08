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
import { Footer } from './components/Footer';
import { FaqSection } from './components/FaqSection';

export function App(): ReactElement {
  const content = usePublicContent();
  const [selection, setSelection] = useState<BookingSelection>({});
  const [quickBookingOpen, setQuickBookingOpen] = useState(false);
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
        <ServicesSection services={content.services} onChoose={(kind, choice) => {
          setSelection(previous => ({ ...previous, [kind]: choice }));
          setQuickBookingOpen(true);
        }} />

        {/* 3. Каталог лошадей и тренеров с модальными окнами */}
        <HorsesAndTrainersSection horses={content.horses} trainers={content.trainers} onChoose={choose} />

        {/* 4. Блок "Стандарты клуба" (архитектура, еврогрунт, гуманный тренинг) */}
        <ClubStandardsSection onChoose={choose} />

        <GiftCertificatesSection onChoose={choose} />
        <FirstLessonSection onBookFirstLesson={bookFirstLesson} />
        <FaqSection />

        {/* 5. Премиальный блок контактов с интерактивной формой бронирования */}
        <ContactsSection services={content.services} selection={selection}
          quickBookingOpen={quickBookingOpen} onCloseQuickBooking={() => setQuickBookingOpen(false)}
          onChoose={(kind, choice) => setSelection(previous => ({ ...previous, [kind]: choice }))}
          onRemove={kind => setSelection(previous => ({ ...previous, [kind]: undefined }))}
          onReset={() => setSelection({})} />
      </main>

      {/* Футер */}
      <Footer brandName="СЛКС Тамбов" />
    </div>
  );
}
