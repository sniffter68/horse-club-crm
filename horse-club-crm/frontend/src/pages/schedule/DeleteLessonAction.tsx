import { useRef, useState } from 'react'
import { Alert, App, Button, Modal, Space, Typography } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useInvalidate } from '@refinedev/core'
import { useCatalogPermissions } from '../catalogs/permissions'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { clientName } from './triad'
import { formatTime } from './time'
import { rubles } from './lessonPaymentSummary'
import type { Lesson } from './types'

type DeletableLesson = Pick<Lesson, 'id' | 'startTime' | 'bookings'>

export function DeleteLessonAction({ lesson, disabled, onDeleted, onBusyChange }: {
  lesson: DeletableLesson; disabled?: boolean; onDeleted: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const { canManage } = useCatalogPermissions('lessons')
  const { message } = App.useApp()
  const invalidate = useInvalidate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const lock = useRef(false)
  const cancel = useRef<HTMLButtonElement>(null)
  const hasMembership = lesson.bookings.some(booking => booking.membership)
  const paid = lesson.bookings.reduce((sum, booking) => sum + (booking.payments ?? [])
    .filter(payment => payment.status === 'PAID').reduce((amount, payment) => amount + Number(payment.amount), 0), 0)

  async function remove() {
    if (lock.current || !canManage || disabled) return
    if (!isUuid(lesson.id)) { setError('Некорректный идентификатор занятия'); return }
    lock.current = true; setBusy(true); setError(undefined); onBusyChange?.(true)
    try {
      await httpClient.delete(`${API_URL}/lessons/${lesson.id}`)
    } catch (cause) {
      setError(toHttpError(cause).message)
      lock.current = false; setBusy(false); onBusyChange?.(false)
      return
    }
    lock.current = false; setBusy(false); setOpen(false); onBusyChange?.(false)
    void message.success('Занятие удалено из расписания')
    // Refine owns cached resources; schedule/dashboard also use direct HTTP reads.
    for (const resource of ['schedule', 'lessons', 'kpi', 'dashboard', 'bookings', 'clients', 'memberships']) {
      void invalidate({ resource, invalidates: ['all'] }).catch(() => undefined)
    }
    window.dispatchEvent(new Event('lesson-deleted'))
    onDeleted()
  }

  if (!canManage) return null
  return <>
    <Button danger type="text" icon={<DeleteOutlined aria-hidden />} disabled={disabled || busy} onClick={() => { setError(undefined); setOpen(true) }}>Удалить занятие</Button>
    <Modal open={open} title="Удалить занятие?" className="lesson-deletion-modal" centered destroyOnHidden
      footer={<Space wrap>
        <Button ref={cancel} disabled={busy} onClick={() => setOpen(false)}>Отмена</Button>
        <Button danger type="primary" loading={busy} disabled={!canManage || disabled} onClick={() => void remove()}>Удалить занятие</Button>
      </Space>}
      closable={!busy} maskClosable={!busy} keyboard={!busy} onCancel={() => { if (!lock.current) setOpen(false) }}
      afterOpenChange={visible => { if (visible) cancel.current?.focus() }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph>Вы уверены, что хотите удалить занятие {formatTime(lesson.startTime)} ({lesson.bookings.map(booking => clientName(booking.client)).join(', ') || 'Нет участников'})?</Typography.Paragraph>
        <Typography.Text type="secondary">Занятие будет удалено безвозвратно.</Typography.Text>
        {hasMembership && <Alert type="warning" showIcon message="Списанное занятие будет возвращено на баланс абонемента" />}
        {paid > 0 && <Alert type="warning" showIcon message={`По занятию есть платежи на сумму ${rubles(paid)}. Кассовые чеки сохранятся в истории кассы`} />}
        {error && <Alert role="alert" type="error" showIcon message="Не удалось удалить занятие" description={error} />}
      </Space>
    </Modal>
  </>
}
