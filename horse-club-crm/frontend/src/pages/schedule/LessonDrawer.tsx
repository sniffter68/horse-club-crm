import { horseServiceDirection, horseServiceWarning } from '../horses/serviceAvailability'
import { trainerServiceWarning } from '../staff/specialization'
import { isMembershipActive } from '../memberships/activity'
import { useRoleAccess } from '../../access'
import { SearchSelect } from '../../components/SearchSelect'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Descriptions, Form, InputNumber, Select, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { DateTime } from 'luxon'
import { useInvalidate } from '@refinedev/core'
import { isPerPersonService } from './groupPricing'
import { LessonPriceFields } from './LessonPayments'
import { isUuid } from '../../uuid'
import { ClientSelectWithCreate } from '../../components/ClientSelectWithCreate'
import { BookingDateTimePicker } from '../../components/BookingDateTimePicker'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { StableEntryModal } from '../stable/shared'
import { useLeadLessonCatalogs } from '../dashboard/useLeadLessonCatalogs'
import { useTriadAvailability } from './useTriadAvailability'
import { useScheduleConflicts } from './useScheduleConflicts'
import { useClientPreferences } from './useClientPreferences'
import { CLUB_TIME_ZONE, toInstant } from './time'
import type { ClientWithMemberships, MembershipSummary } from './types'

const stopPopupEscape = (event: { key: string; stopPropagation: () => void }) => { if (event.key === 'Escape') event.stopPropagation() }

type LessonValues = { participantsCount?: number; pricePerPerson?: number; cost?: number; prepaymentAmount?: number; prepaymentMethod?: string; membershipId?: string; clientId: string; horseId?: string; trainerId: string; serviceId: string; arenaId?: string; startTime: Dayjs; durationMinutes: number }

export interface LessonDrawerProps {
  initialDateTime?: string
  initialTrainerId?: string
  initialArenaId?: string
  initialHorseId?: string
  initialDurationMinutes?: number
  onClose: () => void
  onSaved: (startTime: string) => void
}

export function LessonDrawer({ initialDateTime, initialTrainerId, initialArenaId, initialHorseId, initialDurationMinutes = 60, onClose, onSaved }: LessonDrawerProps) {
  const access = useRoleAccess()
  const isTrainer = access.role === 'TRAINER'
  const ownTrainerId = access.snapshot?.trainerId ?? undefined
  const ownOnly = isTrainer && !access.permissions.lessonCreateAny
  const canCreate = !isTrainer || access.permissions.lessonCreateOwn || access.permissions.lessonCreateAny
  const invalidate = useInvalidate()
  const [form] = Form.useForm<LessonValues>()
  const [revision, retry] = useState(0)
  const [resourceRevision, refreshResources] = useState(0)
  const [failure, setFailure] = useState<string>()
  const report = useCallback((cause: unknown) => setFailure(toHttpError(cause).message), [])
  const catalogs = useLeadLessonCatalogs(true, revision, report)
  useEffect(() => {
    if (ownOnly) form.setFieldValue('trainerId', ownTrainerId)
    else if (isTrainer && ownTrainerId && !form.getFieldValue('trainerId')) form.setFieldValue('trainerId', ownTrainerId)
  }, [form, isTrainer, ownOnly, ownTrainerId])
  const start = Form.useWatch('startTime', form) as Dayjs | undefined
  const duration = Form.useWatch('durationMinutes', form) as number | undefined
  const serviceId = Form.useWatch('serviceId', form) as string | undefined
  const clientId = Form.useWatch('clientId', form) as string | undefined
  const trainerId = Form.useWatch('trainerId', form) as string | undefined
  const membershipId = Form.useWatch('membershipId', form) as string | undefined
  const cost = Form.useWatch('cost', form) as number | undefined
  const [trainerMemberships, setTrainerMemberships] = useState<{ id: string; title: string }[]>([])
  const [memberships, setMemberships] = useState<MembershipSummary[]>([])
  const [membershipsLoading, setMembershipsLoading] = useState(false)
  const [membershipsError, setMembershipsError] = useState<string>()
  const [loadedClient, setLoadedClient] = useState<ClientWithMemberships>()
  const preferences = useClientPreferences(form, loadedClient?.id === clientId ? loadedClient : undefined, catalogs.horses, catalogs.trainers, ['horseId'], !loadedClient, isTrainer || Boolean(initialTrainerId))
  const perPerson = isPerPersonService(catalogs.services.find(row => row.id === serviceId))
  const allowMembership = !perPerson && catalogs.services.find(row => row.id === serviceId)?.allowMembership
  const horseId = Form.useWatch('horseId', form) as string | undefined
  let from: string | undefined, to: string | undefined
  try {
    if (start?.isValid() && duration && duration > 0) {
      from = toInstant(start.format('YYYY-MM-DDTHH:mm'))
      to = new Date(+new Date(from) + duration * 60000).toISOString()
    }
  } catch { /* Invalid input is handled by the form. */ }
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return
      form.setFieldValue('membershipId', undefined)
      setMemberships([]); setTrainerMemberships([]); setMembershipsError(undefined)
      if (!clientId || !isUuid(clientId) || isTrainer && (!from || !to || !serviceId || !allowMembership)) { setMembershipsLoading(false); return }
      setMembershipsLoading(true)
      try {
        if (isTrainer) {
          const { data } = await httpClient.get<{ id: string; title: string }[]>(`${API_URL}/clients/${clientId}/booking-memberships`, { params: { serviceId, from, to }, signal: controller.signal })
          if (!controller.signal.aborted) setTrainerMemberships(data)
          return
        }
        const { data } = await httpClient.get<ClientWithMemberships>(`${API_URL}/clients/${clientId}`, { signal: controller.signal })
        if (!controller.signal.aborted) {
          setLoadedClient(data)
          if (allowMembership) setMemberships(data.memberships.filter(membership => membership.isActive))
        }
      } catch (cause) { if (!controller.signal.aborted) setMembershipsError(toHttpError(cause).message) }
      finally { if (!controller.signal.aborted) setMembershipsLoading(false) }
    })()
    return () => controller.abort()
  }, [allowMembership, clientId, form, revision, isTrainer, serviceId, from, to])
  const availability = useTriadAvailability(from, to, revision + resourceRevision, report, undefined, horseServiceDirection(catalogs.services.find(row => row.id === serviceId)), serviceId)
  const conflicts = useScheduleConflicts(from, to, undefined, revision + resourceRevision)
  const trainerLimit = catalogs.trainers.find(row => row.id === trainerId)?.maxParallelLessons ?? 4
  const occupiedTrainerPlaces = trainerId ? conflicts.trainerOccupancy(trainerId) : undefined
  const trainerFull = occupiedTrainerPlaces !== undefined && occupiedTrainerPlaces >= trainerLimit
  const horseConflict = Boolean(horseId && conflicts.entries.some(entry => entry.horses.some(horse => horse.id === horseId)))
  const eligibleMemberships = memberships.filter(membership => {
    if (!from) return false
    const at = +new Date(from)
    return isMembershipActive(membership) && membership.type !== 'boarding' && membership.type !== 'deposit'
      && Number(membership.remainingUnits ?? membership.remainedLessons) > 0
      && (!membership.validFrom || +new Date(membership.validFrom) <= at)
      && (!(membership.validTo || membership.validUntil) || +new Date(membership.validTo || membership.validUntil) >= at)
  })
  const selectedService = catalogs.services.find(row => row.id === serviceId)
  const direction = horseServiceDirection(selectedService)
  const serviceWarning = horseServiceWarning(catalogs.horses.find(row => row.id === horseId), direction)
  const commissionPercent = Number(catalogs.trainers.find(row => row.id === trainerId)?.commissionPercent ?? 30)
  const nominalPrice = Number(selectedService?.price ?? 0)
  const blockedHorse = (id: string) => {
    const load = availability.data?.horseWorkloads.find(row => row.horseId === id)
    const horse = catalogs.horses.find(row => row.id === id)
    return !load || load.status !== 'AVAILABLE' || load.currentWorkloadMinutes + (duration ?? 0) > load.maxDailyWorkloadMinutes
      || Boolean(horse?.healthStatus && horse.healthStatus !== 'HEALTHY')
  }
  const unavailable = !canCreate || access.loading || (isTrainer && (ownOnly && !isUuid(ownTrainerId ?? '') || membershipsLoading)) || catalogs.loading || catalogs.error || availability.loading || availability.error || !availability.data || !from || (horseId && blockedHorse(horseId)) || horseConflict || conflicts.loading || trainerFull
  const required = [{ required: true, message: 'Заполните поле' }]
  return <StableEntryModal variant="drawer" title="Записать на тренировку" form={form} submitLabel="Записать на тренировку" submitDisabled={Boolean(unavailable)}
    initialValues={{ startTime: dayjs(initialDateTime ? DateTime.fromISO(initialDateTime, { zone: CLUB_TIME_ZONE }).setZone(CLUB_TIME_ZONE).toFormat("yyyy-MM-dd'T'HH:mm") : DateTime.now().setZone(CLUB_TIME_ZONE).startOf('hour').plus({ hours: 1 }).toFormat("yyyy-MM-dd'T'HH:mm")), trainerId: initialTrainerId, arenaId: initialArenaId, horseId: initialHorseId, durationMinutes: initialDurationMinutes }}
    resources={['schedule', 'lessons', 'bookings', 'horses', 'dashboard-stats', 'today-lessons']} successMessage="Тренировка назначена" onClose={onClose}
    onSaved={() => {
      for (const key of ['schedule', 'lessons', 'dashboard-stats', 'today-lessons']) {
        void invalidate({ invalidates: false, invalidationFilters: { queryKey: [key] } })
      }
      window.dispatchEvent(new Event('lesson-created'))
      onSaved(form.getFieldValue('startTime').format('YYYY-MM-DDTHH:mm'))
    }}
    save={async values => {
      if (unavailable) throw new Error('Проверьте доступность лошади и загрузку справочников')
      if (values.membershipId && (!allowMembership || !(isTrainer ? trainerMemberships : eligibleMemberships).some(membership => membership.id === values.membershipId))) throw new Error('Выберите действующий абонемент с остатком занятий на дату тренировки')
      if ([values.clientId, values.serviceId, values.trainerId, values.horseId, values.arenaId, values.membershipId].filter(Boolean).some(id => !isUuid(id!))) throw new Error('Выберите корректные записи из справочников')
      if (ownOnly && values.trainerId !== ownTrainerId) throw new Error('Тренер может создавать записи только в своё расписание')
      if (isTrainer) { delete values.cost; delete values.pricePerPerson; delete values.prepaymentAmount; delete values.prepaymentMethod }
      if (values.membershipId) { delete values.cost; delete values.prepaymentAmount; delete values.prepaymentMethod }
      try {
        await httpClient.post(`${API_URL}/lessons`, { ...values, startTime: toInstant(values.startTime.format('YYYY-MM-DDTHH:mm')) })
      } catch (cause) {
        if (toHttpError(cause).statusCode === 409) refreshResources(n => n + 1)
        throw cause
      }
    }}>
    <Typography.Paragraph type="secondary">Время Москвы. Проверяем здоровье, дневную нагрузку и занятость ресурсов.</Typography.Paragraph>
    {(failure || catalogs.error || availability.error) && <Alert type="error" showIcon message={failure || catalogs.error || availability.error || 'Не удалось загрузить клиентов'}
      action={<Button onClick={() => { retry(n => n + 1) }}>Повторить</Button>} />}
    <Form.Item name="clientId" label="Клиент" rules={required}><ClientSelectWithCreate bookingForTrainer={isTrainer} aria-label="Клиент" showSearch allowClear placeholder="Имя или телефон" /></Form.Item>
    <Form.Item name="startTime" label="Дата и время (Москва)" rules={required}>
      <BookingDateTimePicker />
    </Form.Item>
    <Form.Item name="serviceId" label="Услуга" rules={required}><Select onInputKeyDown={stopPopupEscape} aria-label="Услуга" loading={catalogs.loading} showSearch optionFilterProp="label"
      options={catalogs.services.map(row => ({ value: row.id, label: isTrainer ? `${row.title || row.name} · ${row.durationMinutes ?? 60} мин.` : `${row.title || row.name} · ${Number(row.price ?? 0).toLocaleString('ru-RU')} руб. · ${row.durationMinutes ?? 60} мин.` }))}
      onChange={id => form.setFieldsValue({ participantsCount: 1, pricePerPerson: isPerPersonService(catalogs.services.find(row => row.id === id)) ? Number(catalogs.services.find(row => row.id === id)?.price ?? 0) : undefined, durationMinutes: catalogs.services.find(row => row.id === id)?.durationMinutes ?? 60, cost: Number(catalogs.services.find(row => row.id === id)?.price ?? 0), prepaymentAmount: 0, prepaymentMethod: undefined })} /></Form.Item>
    <Form.Item name="durationMinutes" label="Длительность, мин" rules={[...required, { type: 'number', min: 1, max: 480 }]}><InputNumber min={1} max={480} precision={0} /></Form.Item>
    {to && <Typography.Paragraph aria-live="polite">Окончание: {DateTime.fromISO(to).setZone(CLUB_TIME_ZONE).toFormat('dd.MM.yyyy HH:mm')} (Москва)</Typography.Paragraph>}
    <Form.Item name="trainerId" label="Тренер" rules={required}><Select disabled={ownOnly || access.loading} onChange={preferences.trainerChanged} onInputKeyDown={stopPopupEscape} aria-label="Тренер" loading={catalogs.loading || conflicts.loading} showSearch optionFilterProp="label"
      options={catalogs.trainers.filter(row => !ownOnly || row.id === ownTrainerId).map(row => ({ value: row.id, label: `${row.fullName || row.name} (занято ${conflicts.trainerOccupancy(row.id) ?? '…'}/${row.maxParallelLessons ?? 4})` }))} /></Form.Item>
    {occupiedTrainerPlaces !== undefined && <Typography.Paragraph role="status">Тренер: занято {occupiedTrainerPlaces}/{trainerLimit}, свободно {Math.max(0, trainerLimit - occupiedTrainerPlaces)} мест на выбранный интервал.</Typography.Paragraph>}
    {trainerServiceWarning(catalogs.trainers.find(row => row.id === trainerId), direction) && <Alert type="warning" showIcon role="status" message={trainerServiceWarning(catalogs.trainers.find(row => row.id === trainerId), direction)} />}
    {trainerFull && <Alert type="error" showIcon message={`У тренера достигнут максимум одновременных всадников (${trainerLimit})`} />}
    {!trainerFull && occupiedTrainerPlaces !== undefined && occupiedTrainerPlaces > 0 && <Alert type="warning" showIcon message="У тренера есть пересечение по времени" description="Параллельная запись разрешена в пределах вместимости тренера." />}
    {conflicts.error && <Alert type="warning" showIcon message="Не удалось проверить свободные места тренера" description="При сохранении сервер повторно проверит вместимость."
      action={<Button onClick={() => retry(n => n + 1)}>Повторить</Button>} />}
    <Form.Item name="horseId" label="Лошадь" extra={perPerson ? 'Для экскурсий выбор лошади необязателен' : 'Можно назначить лошадь позже в карточке занятия'}><SearchSelect allowClear placeholder="Назначить позже / Не выбрана" onChange={preferences.horseChanged} onInputKeyDown={stopPopupEscape} aria-label="Лошадь" loading={catalogs.loading || availability.loading} showSearch optionFilterProp="label"
      options={[{ value: '', label: 'Назначить позже / Не выбрана' }, ...catalogs.horses.map(row => ({ value: row.id, label: `${row.name}${horseServiceWarning(row, direction) ? ' · направление отключено' : ''}`, disabled: !from || availability.loading || blockedHorse(row.id) }))]} /></Form.Item>
    {horseId && !availability.loading && blockedHorse(horseId) && <Alert type="warning" showIcon message="Лошадь недоступна или превышен дневной лимит. Выберите другую лошадь или время." />}
    {serviceWarning && <Alert type="warning" showIcon role="status" message={serviceWarning} />}
    {horseConflict && <Alert type="error" showIcon message="Лошадь занята в выбранный интервал. Выберите другое время или лошадь." />}
    <Form.Item name="arenaId" label="Манеж / локация"><Select onInputKeyDown={stopPopupEscape} allowClear showSearch optionFilterProp="label" loading={catalogs.loading}
      options={catalogs.arenas.map(row => ({ value: row.id, label: row.name }))} /></Form.Item>
    {allowMembership && !isTrainer && eligibleMemberships.length > 0 && <Alert type="info" showIcon message={<Checkbox checked={Boolean(membershipId)} onChange={event => form.setFieldValue('membershipId', event.target.checked ? eligibleMemberships[0].id : undefined)}>Списать занятие с абонемента</Checkbox>} />}
    {allowMembership && <Form.Item name="membershipId" label="Абонемент" extra="Оставьте пустым для разового занятия.">
      <Select onInputKeyDown={stopPopupEscape} allowClear loading={membershipsLoading} placeholder="Без абонемента" options={isTrainer ? trainerMemberships.map(membership => ({ value: membership.id, label: membership.title || 'Активный абонемент' })) : eligibleMemberships.map(membership => ({ value: membership.id, label: `${membership.pricingPlan?.name || membership.title || 'Абонемент'} · Осталось: ${membership.remainingUnits ?? membership.remainedLessons}` }))} />
    </Form.Item>}
    {membershipsError && <Alert type="error" showIcon message={membershipsError} action={<Button onClick={() => retry(n => n + 1)}>Повторить</Button>} />}
    {!isTrainer && serviceId && !membershipId && <LessonPriceFields key={serviceId} perPerson={perPerson} price={catalogs.services.find(row => row.id === serviceId)?.price} />}
    {!isTrainer && serviceId && <Descriptions title="Финансовая сводка" column={1} size="small" items={[
      { key: 'nominal', label: 'Номинал услуги', children: `${nominalPrice.toLocaleString('ru-RU')} руб.` },
      { key: 'trainer', label: `Начисление тренеру ${commissionPercent}%`, children: `${(Math.round(nominalPrice * commissionPercent) / 100).toLocaleString('ru-RU')} руб.` },
      { key: 'client', label: 'К оплате клиентом', children: membershipId ? '0 руб. · занятие с абонемента' : `${Number(cost ?? nominalPrice).toLocaleString('ru-RU')} руб.` },
    ]} />}
  </StableEntryModal>
}

