import { useId, useRef, type ReactElement } from 'react';
import { privacyPolicy } from '../legal';

export function PrivacyPolicyLink({ children = 'Политикой конфиденциальности' }: { children?: string }): ReactElement {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <a href={`#${id}`} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:opacity-80"
      onClick={event => { event.preventDefault(); dialog.current?.showModal(); }}>
      {children}
    </a>
    <dialog ref={dialog} id={id} aria-labelledby={`${id}-heading`}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-auto rounded-3xl bg-white p-6 text-left text-sm leading-relaxed text-club-ink shadow-xl backdrop:bg-black/60">
      <div className="sticky top-0 flex justify-end bg-white pb-3">
        <button type="button" autoFocus onClick={() => dialog.current?.close()}
          className="min-h-11 cursor-pointer rounded-full border border-black/20 px-5 hover:bg-club-paper">Закрыть</button>
      </div>
      <h2 id={`${id}-heading`} className="leading-[1.125] mb-4 font-serif text-2xl">Политика конфиденциальности</h2>
      <div className="space-y-3" dangerouslySetInnerHTML={{ __html: privacyPolicy() }} />
    </dialog>
  </>;
}
