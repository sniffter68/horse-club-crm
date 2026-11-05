import { useRef } from 'react';
import { privacyPolicy } from '../legal';

export function PrivacyPolicyLink() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <a href="#privacy" className="text-club-secondary underline underline-offset-4 hover:text-club-deep"
      onClick={event => { event.preventDefault(); dialog.current?.showModal(); }}>
      Политикой конфиденциальности
    </a>
    <dialog ref={dialog} id="privacy" aria-labelledby="privacy-heading"
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-auto rounded-3xl bg-white p-6 text-left text-sm leading-relaxed text-club-ink shadow-xl backdrop:bg-black/60">
      <div className="sticky top-0 flex justify-end bg-white pb-3">
        <button type="button" autoFocus onClick={() => dialog.current?.close()}
          className="min-h-11 cursor-pointer rounded-full border border-black/20 px-5 hover:bg-club-paper">Закрыть</button>
      </div>
      <h2 id="privacy-heading" className="leading-[1.125] mb-4 font-serif text-2xl">Политика конфиденциальности</h2>
      <div className="space-y-3" dangerouslySetInnerHTML={{ __html: privacyPolicy() }} />
    </dialog>
  </>;
}
