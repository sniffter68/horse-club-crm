import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LessonDrawer } from './LessonDrawer'

const captured = vi.hoisted(() => ({ initialValues: {} as Record<string, unknown> }))
vi.mock('../stable/shared', () => ({ StableEntryModal: (props: { initialValues: Record<string, unknown> }) => {
  captured.initialValues = props.initialValues
  return null
} }))
vi.mock('@refinedev/core', () => ({ useInvalidate: () => vi.fn() }))
vi.mock('../dashboard/useLeadLessonCatalogs', () => ({ useLeadLessonCatalogs: () => ({ loading: false, horses: [], trainers: [], services: [], arenas: [] }) }))
vi.mock('./useTriadAvailability', () => ({ useTriadAvailability: () => ({ loading: false }) }))

describe('shared lesson drawer calendar seed', () => {
  it.each(['2026-10-26T11:30', '2026-10-26T08:30:00Z', '2026-10-26T17:30:00+09:00'])('prefills Moscow time and selected resources from %s', initialDateTime => {
    renderToStaticMarkup(createElement(LessonDrawer, { initialDateTime, initialTrainerId: 'trainer', initialArenaId: 'arena', initialDurationMinutes: 30, onClose: vi.fn(), onSaved: vi.fn() }))
    const values = captured.initialValues
    expect((values.startTime as { format: (pattern: string) => string }).format('YYYY-MM-DDTHH:mm')).toBe('2026-10-26T11:30')
    expect(values).toMatchObject({ trainerId: 'trainer', arenaId: 'arena', durationMinutes: 30 })
    expect(values.clientId).toBeUndefined()
  })
})
