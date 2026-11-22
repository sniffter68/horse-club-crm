import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, ConfigProvider, DatePicker, Drawer, Input, Select as AntSelect, Space, Spin, Tag } from 'antd'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import dayjs from 'dayjs'
import { DateTime } from 'luxon'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { tmaRequest } from '../../tma/api'
import { isUuid } from '../../uuid'
import { entryDrawerTheme } from '../../components/entryDrawerTheme'

interface Details {
  id: string; startTime: string; endTime: string; trainerId: string; serviceName: string; status: string
  horses: { id: string; name: string }[]; canReplaceHorse: boolean; trainers: { id: string; name: string }[]
  bookings: { id: string; clientName: string; phone: string | null; horseId: string | null; horseName?: string; payment: string }[]
}
interface Slot { startTime: string; available: boolean; reason?: string }
const reasons = ['Болезнь клиента', 'Погодные условия', 'Перенос по просьбе клиента', 'Другая причина']
const zone = 'Europe/Moscow'

export function LessonActionsDrawer({ lessonId, tmaToken, onClose, onSaved }: {
  lessonId: string; tmaToken?: string; onClose: () => void; onSaved: () => void
}) {
  const { message } = App.useApp()
  const [details, setDetails] = useState<Details>()
  const [step, setStep] = useState<'details' | 'move' | 'cancel'>('details')
  const [date, setDate] = useState(() => DateTime.now().setZone(zone).toISODate()!)
  const [time, setTime] = useState<string>()
  const [horseId, setHorseId] = useState<string>()
  const [trainerId, setTrainerId] = useState<string>()
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [slots, setSlots] = useState<Slot[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const lock = useRef(false)
  const trigger = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => () => { requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus() }) }, [])
  const request = async <T,>(path: string, method = 'GET', body?: object, signal?: AbortSignal): Promise<T> => {
    if (!isUuid(lessonId)) throw new Error('Обновите данные занятия')
    if (tmaToken) return tmaRequest<T>(`lessons/${lessonId}/${path}`, tmaToken, { method, signal, ...(body ? { body: JSON.stringify(body) } : {}) })
    return (await httpClient.request<T>({ url: `${API_URL}/lessons/${lessonId}/${path}`, method, data: body, signal })).data
  }
  useEffect(() => {
    const controller = new AbortController()
    void request<Details>('management-details', 'GET', undefined, controller.signal).then(row => {
      if (controller.signal.aborted) return
      setDetails(row); setDate(DateTime.fromISO(row.startTime, { zone }).toISODate()!); setTrainerId(row.trainerId)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить занятие') })
    return () => controller.abort()
    // Identity and credentials define this drawer's data lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, tmaToken, retry])
  useEffect(() => {
    if (step !== 'move' || !details) return
    const controller = new AbortController()
    setSlots(undefined); setTime(undefined); setError('')
    const query = new URLSearchParams({ date, ...(horseId ? { horseId } : {}), ...(trainerId ? { trainerId } : {}) })
    void request<{ slots: Slot[] }>(`reschedule-slots?${query}`, 'GET', undefined, controller.signal).then(row => {
      if (!controller.signal.aborted) setSlots(row.slots)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить время') })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, date, horseId, trainerId, details, retry])
  const save = async () => {
    if (lock.current || step === 'details') return
    if (step === 'move' && (!time || !slots?.some(slot => slot.available && slot.startTime === time))) return
    if (horseId && !isUuid(horseId) || trainerId && !isUuid(trainerId)) { setError('Выберите ресурс из списка'); return }
    if (step === 'cancel' && !reason.trim()) { setError('Выберите причину отмены'); return }
    lock.current = true; setBusy(true); setError('')
    try {
      await request(step === 'move' ? (tmaToken ? 'reschedule' : 'scheduled-reschedule') : (tmaToken ? 'status' : 'scheduled-cancel'), 'PATCH',
        step === 'move' ? { date, startTime: time, horseId, trainerId, reason: comment.trim() || undefined }
          : { status: 'CANCELLED', reason: [reason, comment.trim()].filter(Boolean).join(': ').slice(0, 300) })
      void message.success(step === 'move' ? 'Занятие перенесено' : 'Занятие отменено')
      onSaved(); onClose()
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : toHttpError(cause).message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <ConfigProvider theme={entryDrawerTheme}><Drawer open placement="bottom" height="auto" title={step === 'move' ? 'Перенести занятие' : step === 'cancel' ? 'Отменить занятие' : 'Занятие'}
    styles={{ body: { maxHeight: '72dvh', overflowY: 'auto' } }} onClose={() => { if (!lock.current) onClose() }} maskClosable={!busy} keyboard={!busy}
    afterOpenChange={open => { if (!open) trigger.current?.focus() }}
    footer={step !== 'details' && <Space wrap><Button disabled={busy} onClick={() => setStep('details')}>Назад</Button><Button type="primary" danger={step === 'cancel'} loading={busy}
      disabled={step === 'move' ? !time || !slots : !reason.trim()} onClick={() => void save()}>{step === 'move' ? 'Подтвердить перенос' : 'Подтвердить отмену'}</Button></Space>}>
    <div className="lesson-actions-content">
      {error && <Alert type="error" showIcon message={error} action={<Button disabled={busy} onClick={() => { setError(''); setRetry(value => value + 1) }}>Повторить</Button>} />}
      {!details ? !error && <Spin aria-label="Загрузка занятия" /> : <>
        <strong>{details.serviceName}</strong>
        <p>{DateTime.fromISO(details.startTime, { zone }).toFormat('dd.MM.yyyy HH:mm')}–{DateTime.fromISO(details.endTime, { zone }).toFormat('HH:mm')} · Москва</p>
        {details.bookings.map(row => <div key={row.id}><strong>{row.clientName}</strong>{row.phone && <p><a style={{ color: 'inherit', textDecoration: 'underline' }} href={`tel:${row.phone}`}>{row.phone}</a></p>}<p>{row.horseName || 'Лошадь не назначена'} · <Tag>{row.payment}</Tag></p></div>)}
        {step === 'details' && details.status === 'SCHEDULED' && <Space wrap><Button type="primary" onClick={() => setStep('move')}>Перенести</Button><Button danger onClick={() => setStep('cancel')}>Отменить</Button></Space>}
        {step === 'move' && <>
          <label htmlFor="lesson-move-date">Новая дата</label>
          <Space wrap><Button disabled={busy} onClick={() => setDate(DateTime.now().setZone(zone).toISODate()!)}>Сегодня</Button><Button disabled={busy} onClick={() => setDate(DateTime.now().setZone(zone).plus({ days: 1 }).toISODate()!)}>Завтра</Button></Space>
          <DatePicker id="lesson-move-date" locale={ruDatePicker} allowClear={false} disabled={busy} value={dayjs(date)} onChange={value => { if (value) setDate(value.format('YYYY-MM-DD')) }} />
          <label htmlFor="lesson-move-trainer">Тренер</label><AntSelect id="lesson-move-trainer" virtual={false} value={trainerId} disabled={busy} onChange={setTrainerId} options={details.trainers.map(row => ({ value: row.id, label: row.name }))} />
          {details.bookings.length === 1 && details.canReplaceHorse && <><label htmlFor="lesson-move-horse">Лошадь</label><AntSelect id="lesson-move-horse" virtual={false} allowClear placeholder="Сохранить текущую" value={horseId} disabled={busy} onChange={setHorseId} options={details.horses.map(row => ({ value: row.id, label: row.name }))} /></>}
          <span>Время по Москве</span>
          {!slots ? !error && <Spin aria-label="Загрузка свободного времени" /> : slots.length === 0 ? <p role="status">Свободного времени нет. Выберите другой день.</p> : <Space wrap>{slots.map(slot => <Button key={slot.startTime} aria-pressed={time === slot.startTime} type={time === slot.startTime ? 'primary' : 'default'} disabled={busy || !slot.available} title={slot.reason} onClick={() => setTime(slot.startTime)}>{slot.startTime}{!slot.available ? ' · занято' : ''}</Button>)}</Space>}
        </>}
        {step === 'cancel' && <><p>Списанное посещение вернётся на абонемент. Для возврата денежной оплаты откройте полную CRM.</p><Space wrap>{reasons.map(value => <Button key={value} disabled={busy} aria-pressed={reason === value} type={reason === value ? 'primary' : 'default'} onClick={() => setReason(value)}>{value}</Button>)}</Space></>}
        {step !== 'details' && <><label htmlFor="lesson-change-comment">Комментарий</label><Input.TextArea id="lesson-change-comment" style={{ resize: 'none' }} autoSize={{ minRows: 3, maxRows: 6 }} maxLength={200} disabled={busy} value={comment} onChange={event => setComment(event.target.value)} /></>}
      </>}
    </div>
  </Drawer></ConfigProvider>
}
