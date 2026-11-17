import type { CSSProperties } from 'react'

/** Stable trainer identity across the calendar, resource grid and trainer board. */
export function lessonAccent(trainerId: string): CSSProperties {
  let hash = 0
  for (const character of trainerId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return { '--lesson-accent': `var(--crm-trainer-${hash % 5})` } as CSSProperties
}
