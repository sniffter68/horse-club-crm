export interface BookingChoice { id: string; name: string }
export interface BookingSelection { service?: BookingChoice; horse?: BookingChoice; trainer?: BookingChoice }
export type BookingKind = keyof BookingSelection;
export type ChooseBooking = (kind: BookingKind, choice: BookingChoice) => void;

export function bookingNotes(selection: BookingSelection, notes: string): string {
  return [selection.horse && `Лошадь: ${selection.horse.name}`, selection.trainer && `Тренер: ${selection.trainer.name}`, notes.trim()]
    .filter(Boolean).join('\n');
}

export function scrollToBooking(): void {
  requestAnimationFrame(() => {
    document.getElementById('booking-heading')?.focus({ preventScroll: true });
    document.getElementById('booking-form')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start',
    });
  });
}
