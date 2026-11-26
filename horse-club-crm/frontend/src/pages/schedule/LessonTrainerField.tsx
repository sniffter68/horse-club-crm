import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Button, Select, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { usePermissions } from '../../modulePermissions'
import { useRoleAccess } from '../../access'
import { isUuid } from '../../uuid'
import type { Trainer } from '../catalogs/types'
import { horseServiceDirection } from '../horses/serviceAvailability'
import { trainerServiceWarning } from '../staff/specialization'
import type { Lesson } from './types'
import { isLessonTrainerLocked } from './trainerLock'
import { catalog } from '../catalogs/loadCatalog'

export function LessonTrainerField({ lesson, disabled = false, onSaved, onBusyChange }: {
  lesson: Lesson; disabled?: boolean; onSaved: (lesson: Lesson) => void; onBusyChange?: (busy: boolean) => void
}) {
  const modules = usePermissions()
  const access = useRoleAccess()
  const id = useId()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const pending = useRef(false)
  const locked = isLessonTrainerLocked(lesson)
  const editable = modules.canWrite('SCHEDULE') && (access.role === 'ADMIN' || access.role === 'MANAGER') && !locked
  useEffect(() => {
    if (!editable) return
    const controller = new AbortController()
    void catalog<Trainer>('trainers', controller.signal)
      .then(data => { if (!controller.signal.aborted) { setTrainers(data); setError(undefined) } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [editable, catalogRevision])
  const warning = trainerServiceWarning(lesson.trainer, horseServiceDirection(lesson.service))
  async function change(trainerId: string) {
    if (pending.current || disabled || !editable) return
    if (!isUuid(lesson.id) || !isUuid(trainerId)) { setError('Выберите корректного тренера'); return }
    pending.current = true; setBusy(true); onBusyChange?.(true); setError(undefined)
    try {
      const { data } = await httpClient.patch<Lesson>(`${API_URL}/lessons/${lesson.id}/trainer`, { trainerId })
      onSaved(data)
      window.dispatchEvent(new Event('lesson-trainer-changed'))
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false) }
  }
  return <div style={{ width: '100%' }}>
    <label htmlFor={id}>Тренер</label>
    {editable ? <Select id={id} aria-label="Тренер" showSearch optionFilterProp="label" style={{ width: '100%' }}
      value={lesson.trainer.id} disabled={disabled || busy} loading={busy} onChange={value => void change(value)}
      options={[lesson.trainer, ...trainers.filter(trainer => trainer.id !== lesson.trainer.id && trainer.isActive !== false)]
        .map(trainer => ({ value: trainer.id, label: trainer.fullName || trainer.name }))} />
      : <Typography.Paragraph>{lesson.trainer.fullName || lesson.trainer.name}</Typography.Paragraph>}
    <Typography.Paragraph type="secondary" role="status">{locked ? 'Тренер зафиксирован после оплаты' : `Начисление получит: ${lesson.trainer.fullName || lesson.trainer.name}. Замена сохраняется сразу.`}</Typography.Paragraph>
    {warning && <Alert type="warning" showIcon message={warning} />}
    {error && <Alert type="error" showIcon role="alert" message={error}
      action={!trainers.length && editable ? <Button onClick={() => setCatalogRevision(value => value + 1)}>Повторить загрузку тренеров</Button> : undefined} />}
  </div>
}
