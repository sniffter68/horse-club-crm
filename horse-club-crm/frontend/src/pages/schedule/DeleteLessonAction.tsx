import { Alert, Typography } from 'antd'
import { ServiceCancellationAction } from '../../components/ServiceCancellationAction'
import { clientName } from './triad'
import { formatTime } from './time'
import type { Lesson } from './types'

type DeletableLesson = Pick<Lesson, 'id' | 'startTime' | 'bookings'>
export function DeleteLessonAction({ lesson, disabled, onDeleted, onBusyChange }: {
  lesson: DeletableLesson; disabled?: boolean; onDeleted: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  return <ServiceCancellationAction resource="lessons" id={lesson.id} label="Удалить занятие" disabled={disabled}
    onChanged={onDeleted} onBusyChange={onBusyChange} description={<>
      <Typography.Paragraph>{formatTime(lesson.startTime)} · {lesson.bookings.map(b => clientName(b.client)).join(', ') || 'Нет участников'}</Typography.Paragraph>
      {lesson.bookings.some(b => b.membership) && <Alert type="warning" message="Списанное занятие будет возвращено на баланс абонемента" />}
    </>} />
}
