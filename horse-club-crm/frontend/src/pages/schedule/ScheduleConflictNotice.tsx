import { Alert } from 'antd'
import { scheduleConflicts, type ScheduleEntry } from './triad'

export function ScheduleConflictNotice({ entries, trainerId, horseIds, error }: { entries: ScheduleEntry[]; trainerId?: string; horseIds: string[]; error?: string }) {
  const conflicts = scheduleConflicts(entries, trainerId, horseIds)
  return <div className="triad-feedback" aria-live="polite">
    {error && <Alert type="warning" showIcon message="Не удалось проверить пересечения занятий" description="При сохранении сервер повторно проверит занятость лошади и клиента." />}
    {conflicts.trainers.length > 0 && <Alert type="info" showIcon message={`У тренера уже запланировано занятие в это время: ${conflicts.trainers.map(e => `${e.riders.join(', ')} / ${e.horses.map(h => h.name).join(', ') || 'без лошади'}`).join('; ')}. Занятие будет добавлено параллельно`} />}
    {conflicts.horses.map(h => <Alert key={h.id} type="error" showIcon message={`Лошадь ${h.name} уже занята в это время`} />)}
  </div>
}
