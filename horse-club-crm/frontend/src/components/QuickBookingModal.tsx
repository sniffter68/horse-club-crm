import { LessonDrawer, type LessonDrawerProps } from '../pages/schedule/LessonDrawer'

/** Quick entry uses the shared booking workflow and its server resource checks. */
export function QuickBookingModal(props: LessonDrawerProps) {
  return <LessonDrawer {...props} />
}
