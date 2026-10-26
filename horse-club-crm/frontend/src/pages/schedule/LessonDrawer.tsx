import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, InputNumber, Select, Typography } from 'antd'
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
  const invalidate = useInvalidate()
  const [form] = Form.useForm<LessonValues>()
  const [revision, retry] = useState(0)
  const [failure, setFailure] = useState<string>()
  const report = useCallback((cause: unknown) => setFailure(toHttpError(cause).message), [])
  const catalogs = useLeadLessonCatalogs(true, revision, report)
  const start = Form.useWatch('startTime', form) as Dayjs | undefined
  const duration = Form.useWatch('durationMinutes', form) as number | undefined
  const serviceId = Form.useWatch('serviceId', form) as string | undefined
  const clientId = Form.useWatch('clientId', form) as string | undefined
  const membershipId = Form.useWatch('membershipId', form) as string | undefined
  const [memberships, setMemberships] = useState<MembershipSummary[]>([])
  const [membershipsLoading, setMembershipsLoading] = useState(false)
  const [membershipsError, setMembershipsError] = useState<string>()
  const [loadedClient, setLoadedClient] = useState<ClientWithMemberships>()
  const preferences = useClientPreferences(form, loadedClient?.id === clientId ? loadedClient : undefined, catalogs.horses, catalogs.trainers, ['horseId'], !loadedClient, Boolean(initialTrainerId))
  const perPerson = isPerPersonService(catalogs.services.find(row => row.id === serviceId))
  const allowMembership = !perPerson && catalogs.services.find(row => row.id === serviceId)?.allowMembership
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return
      form.setFieldValue('membershipId', undefined)
      setMemberships([]); setMembershipsError(undefined)
      if (!clientId || !isUuid(clientId)) { setMembershipsLoading(false); return }
      setMembershipsLoading(true)
      try {
        const { data } = await httpClient.get<ClientWithMemberships>(`${API_URL}/clients/${clientId}`, { signal: controller.signal })
        if (!controller.signal.aborted) {
          setLoadedClient(data)
          if (allowMembership) setMemberships(data.memberships.filter(membership => membership.isActive))
        }
      } catch (cause) { if (!controller.signal.aborted) setMembershipsError(toHttpError(cause).message) }
      finally { if (!controller.signal.aborted) setMembershipsLoading(false) }
    })()
    return () => controller.abort()
  }, [allowMembership, clientId, form, revision])
  const horseId = Form.useWatch('horseId', form) as string | undefined
  let from: string | undefined, to: string | undefined
  try {
    if (start?.isValid() && duration && duration > 0) {
      from = toInstant(start.format('YYYY-MM-DDTHH:mm'))
      to = new Date(+new Date(from) + duration * 60000).toISOString()
    }
  } catch { /* Invalid input is handled by the form. */ }
  const availability = useTriadAvailability(from, to, revision, report)
  const blockedHorse = (id: string) => {
    const load = availability.data?.horseWorkloads.find(row => row.horseId === id)
    const horse = catalogs.horses.find(row => row.id === id)
    return !load || load.status !== 'AVAILABLE' || load.currentWorkloadMinutes + (duration ?? 0) > load.maxDailyWorkloadMinutes
      || Boolean(horse?.healthStatus && horse.healthStatus !== 'HEALTHY')
  }
  const unavailable = catalogs.loading || catalogs.error || availability.loading || availability.error || !availability.data || !from || (horseId && blockedHorse(horseId))
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
      if ([values.clientId, values.serviceId, values.trainerId, values.horseId, values.arenaId, values.membershipId].filter(Boolean).some(id => !isUuid(id!))) throw new Error('Выберите корректные записи из справочников')
      if (values.membershipId) { delete values.cost; delete values.prepaymentAmount; delete values.prepaymentMethod }
      await httpClient.post(`${API_URL}/lessons`, { ...values, startTime: toInstant(values.startTime.format('YYYY-MM-DDTHH:mm')) })
    }}>
    <Typography.Paragraph type="secondary">Время Москвы. Проверяем здоровье, дневную нагрузку и занятость ресурсов.</Typography.Paragraph>
    {(failure || catalogs.error || availability.error) && <Alert type="error" showIcon message={failure || catalogs.error || availability.error || 'Не удалось загрузить клиентов'}
      action={<Button onClick={() => { retry(n => n + 1) }}>Повторить</Button>} />}
    <Form.Item name="clientId" label="Клиент" rules={required}><ClientSelectWithCreate aria-label="Клиент" showSearch allowClear placeholder="Имя или телефон" /></Form.Item>
    <Form.Item name="startTime" label="Дата и время (Москва)" rules={required}>
      <BookingDateTimePicker />
    </Form.Item>
    <Form.Item name="serviceId" label="Услуга" rules={required}><Select onInputKeyDown={stopPopupEscape} aria-label="Услуга" loading={catalogs.loading} showSearch optionFilterProp="label"
      options={catalogs.services.map(row => ({ value: row.id, label: row.title || row.name }))}
      onChange={id => form.setFieldsValue({ participantsCount: 1, pricePerPerson: isPerPersonService(catalogs.services.find(row => row.id === id)) ? Number(catalogs.services.find(row => row.id === id)?.price ?? 0) : undefined, durationMinutes: catalogs.services.find(row => row.id === id)?.durationMinutes ?? 60, cost: Number(catalogs.services.find(row => row.id === id)?.price ?? 0), prepaymentAmount: 0, prepaymentMethod: undefined })} /></Form.Item>
    <Form.Item name="durationMinutes" label="Длительность, мин" rules={[...required, { type: 'number', min: 1, max: 480 }]}><InputNumber min={1} max={480} precision={0} /></Form.Item>
    <Form.Item name="trainerId" label="Тренер" rules={required}><Select onChange={preferences.trainerChanged} onInputKeyDown={stopPopupEscape} aria-label="Тренер" loading={catalogs.loading} showSearch optionFilterProp="label"
      options={catalogs.trainers.map(row => ({ value: row.id, label: row.fullName || row.name }))} /></Form.Item>
    <Form.Item name="horseId" label="Лошадь" rules={perPerson ? [] : required} extra={perPerson ? 'Для экскурсий выбор лошади необязателен' : undefined}><Select allowClear onChange={preferences.horseChanged} onInputKeyDown={stopPopupEscape} aria-label="Лошадь" loading={catalogs.loading || availability.loading} showSearch optionFilterProp="label"
      options={catalogs.horses.map(row => ({ value: row.id, label: row.name, disabled: !from || availability.loading || blockedHorse(row.id) }))} /></Form.Item>
    {horseId && blockedHorse(horseId) && <Alert type="warning" showIcon message="Лошадь недоступна или превышен дневной лимит. Выберите другую лошадь или время." />}
    <Form.Item name="arenaId" label="Манеж / локация"><Select onInputKeyDown={stopPopupEscape} allowClear showSearch optionFilterProp="label" loading={catalogs.loading}
      options={catalogs.arenas.map(row => ({ value: row.id, label: row.name }))} /></Form.Item>
    {allowMembership && <Form.Item name="membershipId" label="Абонемент" extra="Оставьте пустым для разового занятия.">
      <Select allowClear loading={membershipsLoading} placeholder="Без абонемента" options={memberships.map(membership => ({ value: membership.id, label: `${membership.pricingPlan?.name || membership.title || 'Абонемент'} · Осталось: ${membership.remainedLessons}` }))} />
    </Form.Item>}
    {membershipsError && <Alert type="error" showIcon message={membershipsError} action={<Button onClick={() => retry(n => n + 1)}>Повторить</Button>} />}
    {serviceId && !membershipId && <LessonPriceFields key={serviceId} perPerson={perPerson} price={catalogs.services.find(row => row.id === serviceId)?.price} />}
  </StableEntryModal>
}

