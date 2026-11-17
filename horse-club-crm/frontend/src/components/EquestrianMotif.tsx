/** Decorative club linework, excluded from the accessibility tree. */
export function EquestrianMotif({ horse = false }: { horse?: boolean }) {
  return <svg className={`equestrian-motif${horse ? ' equestrian-motif--horse' : ''}`} viewBox="0 0 320 320" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {horse ? <path d="M70 290c8-58 35-92 74-126l-22-25-33 14-20-17 38-45 36-14 5-40 24 24 22-12c40 22 66 65 70 111l-18 130H70Zm78-126c40 5 63-18 69-48M173 85l12 3m9-39c-4 24 20 38 33 61 21 37 22 89 15 133" /> : <>
      <path d="m101 48 20 53c-21 16-33 42-33 72 0 46 30 78 72 78s72-32 72-78c0-30-12-56-33-72l20-53c39 26 61 71 61 125 0 77-49 126-120 126S40 250 40 173c0-54 22-99 61-125Z" />
      <path d="m82 111 10 6m-24 34 11 2m-9 40 11-2m9 39 9-7m43 50 2-11m36 11-2-11m43-32-9-7m21-30-11-2m11-38-11 2m-3-42-10 6" />
    </>}
  </svg>
}
