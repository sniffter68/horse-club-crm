import { usePublicContent } from './usePublicContent';
import { useState, type ReactElement } from 'react';
import { firstLesson, scrollToBooking, type BookingSelection, type ChooseBooking } from './booking';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ServicesSection } from './components/ServicesSection';
import { HorsesCatalogSection, CoachesSection } from './components/HorsesAndTrainersSection';
import { ClubStandardsSection } from './components/ClubStandardsSection';
import { FirstLessonSection } from './components/FirstLessonSection';
import { GiftCertificatesSection } from './components/GiftCertificatesSection';
import { ContactsSection } from './components/ContactsSection';
import { Footer } from './components/Footer';
import { FaqSection } from './components/FaqSection';
import { ReviewsSection } from './components/ReviewsSection';
import { ScrollToTop } from './components/ScrollToTop';

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
        {/* 1. Первое знакомство с лошадьми и поддержка тренера */}
        <HeroSection onBookFirstLesson={bookFirstLesson} />

        <ClubStandardsSection onChoose={choose} />
        <section id="services">
          <ServicesSection services={content.services} onChoose={(kind, choice) => {
            setSelection(previous => ({ ...previous, [kind]: choice }));
            setQuickBookingOpen(true);
          }} />
          <GiftCertificatesSection onChoose={choose} />
        </section>
        <div id="horses-trainers">
          <HorsesCatalogSection horses={content.horses} trainers={content.trainers} onChoose={choose} />
          <CoachesSection horses={content.horses} trainers={content.trainers} onChoose={choose} />
        </div>
        <FirstLessonSection onBookFirstLesson={bookFirstLesson} />
        <ReviewsSection />
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
      <ScrollToTop />
    </div>
  );
}
