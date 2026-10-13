import { useState } from 'react'
import { useSelect } from '@refinedev/antd'
import { useSearchParams } from 'react-router-dom'
import { Button, DatePicker, Form, Input, List, Select, Space, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/ru'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { DateTime } from 'luxon'
import { API_URL, httpClient } from '../../httpClient'
import { dateOnly } from '../cards/format'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { Horse } from '../catalogs/types'
import { CLUB_TIME_ZONE, toInstant } from '../schedule/time'
import { StableEntryModal, StableListState } from './shared'
import { useStableList } from './useStableList'
import { vetTypes, type VetEvent, type VetType } from './types'

const typeOptions = Object.entries(vetTypes).map(([value, label]) => ({ value, label }))
type VetValues = { horseId: string; type: VetType; eventDate: Dayjs; nextDueDate?: Dayjs; status: 'scheduled' | 'completed'; performedBy?: string; notes?: string }
const instant = (date: Dayjs) => toInstant(`${date.format('YYYY-MM-DD')}T12:00`)

export function VetEntry({ horseId, event, onClose, onSaved }: { horseId?: string; event?: VetEvent; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<VetValues>()
  const { selectProps } = useSelect<Horse>({ resource: 'horses', optionLabel: 'name', optionValue: 'id', pagination: { pageSize: 100 },
    queryOptions: { enabled: !horseId && !event, retry: false } })
  const today = dayjs(DateTime.now().setZone(CLUB_TIME_ZONE).toISODate())
  return <StableEntryModal title={event ? `Выполнить: ${vetTypes[event.type]} · ${event.horse.name}` : 'Новая вет-процедура'} form={form}
    submitLabel={event ? 'Отметить выполнение' : 'Сохранить процедуру'} onClose={onClose} onSaved={onSaved}
    save={values => {
      const details = { nextDueDate: values.nextDueDate ? instant(values.nextDueDate) : undefined, performedBy: values.performedBy, notes: values.notes }
      return event ? httpClient.patch(`${API_URL}/vet/events/${event.id}/complete`, details)
        : httpClient.post(`${API_URL}/vet/events`, { ...details, horseId: horseId || values.horseId, type: values.type,
          eventDate: values.status === 'completed' && values.eventDate.isSame(today, 'day') ? new Date().toISOString() : instant(values.eventDate), status: values.status })
    }}>
    {event ? <Typography.Paragraph>Процедура будет отмечена выполненной сейчас. Укажите следующую дату, чтобы она появилась в календаре.</Typography.Paragraph> : <>
      {!horseId && <Form.Item name="horseId" label="Лошадь" rules={[{ required: true, message: 'Выберите лошадь' }]}><Select {...selectProps} showSearch optionFilterProp="label" /></Form.Item>}
      <Form.Item name="type" label="Процедура" initialValue="shoeing" rules={[{ required: true }]}><Select options={typeOptions} /></Form.Item>
      <Form.Item name="status" label="Состояние" initialValue="scheduled"><Select options={[{ value: 'scheduled', label: 'Запланирована' }, { value: 'completed', label: 'Уже выполнена' }]} /></Form.Item>
      <Form.Item name="eventDate" label="Дата процедуры (Москва)" initialValue={today} rules={[{ required: true, message: 'Укажите дату' }]}>
        <DatePicker locale={ruDatePicker} format="DD.MM.YYYY" style={{ width: '100%' }} />
      </Form.Item>
    </>}
    <Form.Item name="nextDueDate" label="Следующая процедура (необязательно)"><DatePicker locale={ruDatePicker} format="DD.MM.YYYY" style={{ width: '100%' }} /></Form.Item>
    <Form.Item name="performedBy" label="Ветеринар / коваль" rules={[{ max: 200 }]}><Input maxLength={200} /></Form.Item>
    <Form.Item name="notes" label="Комментарий" rules={[{ max: 2000 }]}><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} /></Form.Item>
  </StableEntryModal>
}

export function VetJournal({ horseId }: { horseId?: string }) {
  const { canManage } = useCatalogPermissions()
  const [search, setSearch] = useSearchParams()
  const [horsePage, setHorsePage] = useState(1)
  const [horseType, setHorseType] = useState<VetType>()
  const [showHistory, setShowHistory] = useState(false)
  const [editor, setEditor] = useState<VetEvent | 'new'>()
  const type = horseId ? horseType : (search.get('type') && search.get('type')! in vetTypes ? search.get('type') as VetType : undefined)
  const page = horseId ? horsePage : Math.max(1, Number(search.get('page')) || 1)
  const setPage = (next: number) => { if (horseId) setHorsePage(next); else setSearch(previous => { previous.set('page', String(next)); return previous }) }
  const params = new URLSearchParams({ limit: '20', offset: String((page - 1) * 20) })
  if (horseId) params.set('horseId', horseId)
  if (type) params.set('type', type)
  const query = useStableList<VetEvent>(`vet/${horseId || showHistory ? 'events' : 'upcoming'}?${params}`)
  return <section aria-label="Здоровье и ковка" className="stable-section">
    <Space wrap>
      <Select aria-label="Тип процедуры" placeholder="Все процедуры" allowClear value={type} style={{ minWidth: 160 }} options={typeOptions}
        onChange={(next: VetType | undefined) => {
          if (horseId) { setHorseType(next); setHorsePage(1) }
          else setSearch(previous => { if (next) previous.set('type', next); else previous.delete('type'); previous.delete('page'); return previous })
        }} />
      {!horseId && <Select aria-label="Период веткалендаря" value={showHistory ? 'history' : 'upcoming'} style={{ minWidth: 190 }}
        options={[{ value: 'upcoming', label: 'Просрочено и 14 дней' }, { value: 'history', label: 'Все процедуры' }]}
        onChange={value => { setShowHistory(value === 'history'); setPage(1) }} />}
      {canManage && <Button type="primary" onClick={() => setEditor('new')}>Добавить процедуру</Button>}
    </Space>
    <Typography.Paragraph type="secondary">Просрочка определяется по московской дате. Следующая дата создаёт отдельную запланированную процедуру.</Typography.Paragraph>
    <StableListState {...query} total={query.result?.total ?? 0} page={page} onPage={setPage}>
      <List dataSource={query.result?.data} renderItem={event => <List.Item><div className="stable-row">
        <Space wrap><strong>{event.horse.name}</strong><Tag>{vetTypes[event.type]}</Tag><span className="data-mono">{dateOnly(event.eventDate)}</span>
          <Tag className={`crm-tag crm-tag--${event.status === 'overdue' ? 'danger' : 'success'}`}>{event.status === 'completed' ? 'Выполнено' : event.status === 'overdue' ? 'Просрочено' : 'В графике'}</Tag></Space>
        {event.performedBy && <div>Ветеринар / коваль: {event.performedBy}</div>}
        {event.notes && <div>{event.notes}</div>}
        {event.nextDueDate && <div>Следующая: {dateOnly(event.nextDueDate)}</div>}
        {canManage && event.status !== 'completed' && <Button size="small" onClick={() => setEditor(event)}>Отметить выполнение</Button>}
      </div></List.Item>} />
    </StableListState>
    {editor && <VetEntry horseId={horseId} event={editor === 'new' ? undefined : editor} onClose={() => setEditor(undefined)}
      onSaved={() => { setEditor(undefined); query.refresh() }} />}
  </section>
}

export function VetCalendarPage() {
  return <div className="stable-dashboard"><Typography.Title level={2}>Ветеринарный журнал</Typography.Title>
    <Typography.Paragraph>Ближайшие процедуры и просроченные назначения по всей конюшне.</Typography.Paragraph><VetJournal /></div>
}
