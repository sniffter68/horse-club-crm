import { LessonDrawer } from '../schedule/LessonDrawer'
import { useRoleAccess } from '../../access'
import { useEffect, useRef, useState } from 'react'
import { useLogout } from '@refinedev/core'
import { Alert, App, Button, DatePicker, Empty, Input, Segmented, Spin, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { DateTime } from 'luxon'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { usePermissions } from '../../modulePermissions'
import { useWorkspace } from './useWorkspace'
import type { BoardLesson, TrainerBoard as Board } from './types'
import './workspace.css'
import { ClubIcon } from '../../components/ClubIcon'
import { lessonAccent } from '../../components/lessonAccent'
import { tmaRequest } from '../../tma/api'

const zone = 'Europe/Moscow'
const clock = (value: string) => DateTime.fromISO(value, { zone }).toFormat('HH:mm')
const statusLabels = { SCHEDULED: 'Запланировано', COMPLETED: 'Проведено', NO_SHOW: 'Неявка', CANCELLED: 'Отменено' }

function LessonCard({ lesson, canWrite, onSaved, tmaToken }: { lesson: BoardLesson; canWrite: boolean; onSaved: () => void; tmaToken?: string }) {
  const [note, setNote] = useState(lesson.trainerNote ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const lock = useRef(false)
  const { message } = App.useApp()
  const mark = async (status: 'COMPLETED' | 'NO_SHOW') => {
    if (lock.current || !isUuid(lesson.id)) return
    lock.current = true; setBusy(true); setError(undefined)
    try {
      if (tmaToken) await tmaRequest(`lessons/${lesson.id}/trainer-status`, tmaToken, { method: 'PATCH', body: JSON.stringify({ status, trainerNote: note }) })
      else await httpClient.patch(`${API_URL}/lessons/${lesson.id}/trainer-status`, { status, trainerNote: note })
      void message.success(statusLabels[status]); onSaved()
    } catch (cause: unknown) { setError(toHttpError(cause).message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <article className={`board-lesson ${lesson.isOwn ? 'board-lesson-own' : ''}`} style={lessonAccent(lesson.trainerId)} aria-label={`${clock(lesson.startTime)} ${lesson.trainer.name}`}>
    <strong className="club-icon-label"><ClubIcon name="clock" />{clock(lesson.startTime)}–{clock(lesson.endTime)}</strong>
    {lesson.isOwn ? <><b>{lesson.bookings.map(row => row.client?.name).filter(Boolean).join(', ') || 'Всадник не назначен'}</b>
      <Tag color={lesson.bookings.length && lesson.bookings.every(row => row.clientConfirmed) ? 'success' : 'warning'}>{lesson.bookings.length && lesson.bookings.every(row => row.clientConfirmed) ? 'Подтверждено' : 'Ждём подтверждения'}</Tag></> : <b>{lesson.trainer.name}</b>}
    <span>{lesson.bookings.map(row => row.horse?.name).filter(Boolean).join(', ') || 'Лошадь не назначена'}</span>
    <span>{lesson.arena?.name || 'Площадка не назначена'}</span>
    <Tag color={lesson.status === 'COMPLETED' ? 'success' : 'default'}>{statusLabels[lesson.status]}</Tag>
    {lesson.isOwn && lesson.status === 'SCHEDULED' && canWrite && <>
      <label htmlFor={`note-${lesson.id}`}>Заметка по тренировке / лошади</label>
      <Input id={`note-${lesson.id}`} value={note} maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} />
      <div className="board-actions"><Button icon={<ClubIcon name="check" />} type="primary" disabled={busy} onClick={() => void mark('COMPLETED')}>Проведено</Button><Button disabled={busy} onClick={() => void mark('NO_SHOW')}>Неявка</Button></div>
    </>}
    {lesson.isOwn && lesson.status !== 'SCHEDULED' && lesson.trainerNote && <p>{lesson.trainerNote}</p>}
    {error && <Alert type="error" showIcon message={error} />}
  </article>
}

export function TrainerBoardPage() {
  const { mutate: logout } = useLogout()
  const permissions = usePermissions()
  const access = useRoleAccess()
  const canCreate = !access.loading && Boolean(access.permissions.lessonCreateAny || access.permissions.lessonCreateOwn && access.snapshot?.trainerId)
  return <TrainerBoardView canWrite={permissions.canWrite('SCHEDULE')} canCreate={canCreate} ownTrainerId={access.snapshot?.trainerId ?? undefined} onExit={() => logout()} />
}

export function TrainerBoardView({ canWrite, canCreate = false, ownTrainerId, onExit, tmaToken, date: selectedDate, onDateChange }: { canWrite: boolean; canCreate?: boolean; ownTrainerId?: string; onExit: () => void; tmaToken?: string; date?: string; onDateChange?: (date: string) => void }) {
  const [booking, setBooking] = useState(false)
  const [localDate, setLocalDate] = useState(() => DateTime.now().setZone(zone).toISODate()!)
  const date = selectedDate ?? localDate
  const setDate = onDateChange ?? setLocalDate
  const [mine, setMine] = useState(false)
  const [now, setNow] = useState(() => DateTime.now().setZone(zone))
  useEffect(() => {
    const timer = window.setInterval(() => setNow(DateTime.now().setZone(zone)), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const nowMinute = now.hour * 60 + now.minute
  const isCurrentSlot = (minute: number) => date === now.toISODate() && nowMinute >= minute && nowMinute < minute + 30
  const { data, error, loading, refresh } = useWorkspace<Board>(`trainer-board?date=${date}`, tmaToken)
  useEffect(() => { window.Telegram?.WebApp?.ready(); window.Telegram?.WebApp?.expand() }, [])
  const trainers = data?.trainers.filter(row => !mine || row.id === data.trainerId) ?? []
  const lessons = data?.lessons ?? []
  // Each half-hour is a shared row. Simultaneous individual lessons stack inside
  // their trainer's cell, so they remain readable and never cover another card.
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  const first = Math.max(0, Math.min(Math.floor(minutes(data?.openTime ?? '08:00') / 30) * 30, ...lessons.map(row => Math.floor(DateTime.fromISO(row.startTime, { zone }).diff(DateTime.fromISO(date, { zone }), 'minutes').minutes / 30) * 30)))
  const last = Math.min(1440, Math.max(Math.ceil(minutes(data?.closeTime ?? '22:00') / 30) * 30, ...lessons.map(row => Math.ceil(DateTime.fromISO(row.endTime, { zone }).diff(DateTime.fromISO(date, { zone }), 'minutes').minutes / 30) * 30)))
  const slots = Array.from({ length: Math.max(1, (last - first) / 30) }, (_, index) => first + index * 30)
  return <main className="trainer-workspace">
    <header className="trainer-workspace-header"><div><Typography.Title level={3}><ClubIcon name="calendar" /> Расписание клуба</Typography.Title><span>{data?.trainers.find(row => row.id === data.trainerId)?.name || 'Рабочее место тренера'}</span></div><Button onClick={onExit}>{tmaToken ? 'Назад' : 'Выйти'}</Button></header>
    <div className="workspace-toolbar"><label htmlFor="trainer-board-date">Дата</label><DatePicker id="trainer-board-date" locale={ruDatePicker} placement="bottomRight" classNames={{ popup: { root: 'trainer-date-popup' } }} allowClear={false} value={dayjs(date).locale('ru')} onChange={value => { if (value) setDate(value.format('YYYY-MM-DD')) }} />
      <Segmented value={mine ? 'Только мои' : 'Все тренеры'} options={['Все тренеры', 'Только мои']} onChange={value => setMine(value === 'Только мои')} /><Button onClick={refresh}>Обновить</Button>
      {canWrite && canCreate && !tmaToken && <Button type="primary" onClick={() => setBooking(true)}>Записать на тренировку</Button>}</div>
    {booking && canWrite && canCreate && !tmaToken && <LessonDrawer initialTrainerId={ownTrainerId} initialDateTime={`${date}T10:00:00+03:00`} onClose={() => setBooking(false)} onSaved={start => { setBooking(false); setDate(start.slice(0, 10)); refresh() }} />}
    <p>Время московское · Свои занятия выделены. Остальные показывают занятость площадок и лошадей.</p>
    {error && <Alert type="error" showIcon message={error} action={<Button onClick={refresh}>Повторить</Button>} />}
    {loading ? <div className="workspace-loading"><Spin aria-label="Загрузка расписания" /></div> : data && <>
      {!lessons.length && <Empty description="На эту дату занятий нет" />}
      <div className="trainer-board-scroll" tabIndex={0} aria-label="Общая шахматка расписания">
        <table className="trainer-board"><thead><tr><th scope="col">МСК</th>{trainers.map(trainer => <th scope="col" key={trainer.id}>{trainer.name}</th>)}</tr></thead>
          <tbody>{slots.map(minute => <tr key={minute} className={isCurrentSlot(minute) ? 'board-row-current' : undefined}><th scope="row">{isCurrentSlot(minute) && <span className="board-now-indicator" role="img" aria-label={`Сейчас ${now.toFormat('HH:mm')} МСК`} />}{DateTime.fromISO(date, { zone }).plus({ minutes: minute }).toFormat('HH:mm')}</th>{trainers.map(trainer => {
            const at = DateTime.fromISO(date, { zone }).plus({ minutes: minute }).toMillis()
            const starting = lessons.filter(lesson => lesson.trainerId === trainer.id && (+new Date(lesson.startTime) >= at || minute === 0) && +new Date(lesson.startTime) < at + 1800000)
            const continuing = lessons.filter(lesson => lesson.trainerId === trainer.id && +new Date(lesson.startTime) < at && +new Date(lesson.endTime) > at && lesson.status !== 'CANCELLED')
            return <td key={trainer.id}>{starting.map(lesson => <LessonCard key={lesson.id} lesson={lesson} canWrite={canWrite} onSaved={refresh} tmaToken={tmaToken} />)}{continuing.map(lesson => <span className="board-continuation" key={lesson.id}>↳ до {clock(lesson.endTime)} · {lesson.bookings.map(row => row.horse?.name).filter(Boolean).join(', ')}</span>)}</td>
          })}</tr>)}</tbody></table>
      </div></>}
  </main>
}
