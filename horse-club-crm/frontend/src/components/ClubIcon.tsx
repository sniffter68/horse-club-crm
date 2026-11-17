import type { SVGProps } from 'react'

const paths = {
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4m2 0a1 1 0 0 1 1 1v12H5a2 2 0 0 1-2-2V5m18 6h-6v5h6m-3-2.5h.01',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  stable: 'M3 21V8l9-5 9 5v13M8 21v-8h8v8M3 9h18m-9 4v8',
  clock: 'M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7.87a4 4 0 0 1 0 7.75',
  check: 'm5 12 4 4L19 6',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 13h4',
} as const

/** Shared outline icons for club workspace surfaces; labels live in adjacent text. */
export function ClubIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="club-icon" {...props}><path d={paths[name]} /></svg>
}
