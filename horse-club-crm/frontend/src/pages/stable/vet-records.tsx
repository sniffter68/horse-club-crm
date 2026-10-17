import { useState } from 'react'
import './vet-print.css'
import { useCustom } from '@refinedev/core'
import { useSelect } from '@refinedev/antd'
import { Alert, App, Button, Card, DatePicker, Form, List, Modal, Select, Space, Tag, Timeline, Typography } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { DateTime } from 'luxon'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { useSearchParams } from 'react-router-dom'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { useRoleAccess } from '../../access'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { dateOnly } from '../cards/format'
import { toInstant } from '../schedule/time'
import { StableEntryModal, StableListState } from './shared'
import { stablePagination } from './pagination'
import { useStableList } from './useStableList'
import { isHorseUuid } from './horseId'
import { VetRecordForm } from './vet-record-form'
import { healthStatuses, recordTypes, type HealthStatus, type RecordType, type VetHorse, type VetRecord, type VetSummary } from './vet-record-types'

function HealthEditor({ horse, onClose, onSaved }: { horse: VetHorse; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<{ healthStatus: HealthStatus; quarantineUntil?: Dayjs | null }>()
  const status = Form.useWatch('healthStatus', form) || horse.healthStatus
  return <StableEntryModal title={`Здоровье: ${horse.name}`} form={form} submitLabel="Сохранить здоровье" onClose={onClose} onSaved={onSaved}
    save={async values => { await httpClient.patch(`${API_URL}/vet/horses/${horse.id}/health-status`, { healthStatus: values.healthStatus,
      quarantineUntil: values.healthStatus === 'QUARANTINE' && values.quarantineUntil ? toInstant(`${values.quarantineUntil.format('YYYY-MM-DD')}T23:59:59`) : null }); window.dispatchEvent(new Event('horse-status-changed')) }}>
    <Typography.Paragraph>Карантин, лечение и выбытие запрещают новые назначения на тренировки. Проверьте предстоящие занятия в карточке лошади и замените её. Снятие карантина — вручную после решения врача.</Typography.Paragraph>
    <Form.Item name="healthStatus" label="Состояние здоровья" initialValue={horse.healthStatus || 'HEALTHY'} rules={[{ required: true }]}><Select aria-label="Состояние здоровья" options={Object.entries(healthStatuses).map(([value, label]) => ({ value, label }))} /></Form.Item>
    {status === 'QUARANTINE' && <Form.Item name="quarantineUntil" label="Карантин до (необязательно)" initialValue={horse.quarantineUntil ? dayjs(DateTime.fromISO(horse.quarantineUntil, { zone: 'Europe/Moscow' }).toISODate()) : undefined}><DatePicker locale={ruDatePicker} format="DD.MM.YYYY" /></Form.Item>}
  </StableEntryModal>
}
interface Passport { horse: VetHorse & { vetRecords: VetRecord[]; vetEvents: { id: string; type: string; eventDate: string; status: string; notes?: string }[]; healthLogs: { id: string; type: string; occurredAt: string; notes?: string }[] }; generatedAt: string }
const legacyTypes: Record<string, string> = { ...recordTypes, INSPECTION: 'Осмотр', vaccination: 'Вакцинация', deworming: 'Глистогон', shoeing: 'Ковка / расчистка', vet_check: 'Осмотр', dentist: 'Стоматология' }
const legacyStatuses: Record<string, string> = { scheduled: 'Запланировано', completed: 'Выполнено', overdue: 'Просрочено' }
function VetPassport({ horseId, onClose }: { horseId: string; onClose: () => void }) {
  const { query } = useCustom<Passport>({ url: `${API_URL}/vet/horses/${horseId}/passport`, method: 'get', errorNotification: false, queryOptions: { retry: false } })
  const data = query.data?.data
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `vet-passport-${horseId}.json`; a.click(); URL.revokeObjectURL(url)
  }
  return <Modal open title="Ветеринарная карта" width={1000} onCancel={onClose} footer={<Space wrap><Button onClick={onClose}>Закрыть</Button><Button disabled={!data || query.isFetching} onClick={download}>Экспорт JSON</Button><Button type="primary" disabled={!data || query.isFetching} onClick={() => window.print()}>Печать веткарты</Button></Space>}>
    {query.isError && <Alert type="error" message="Не удалось загрузить веткарту" action={<Button onClick={() => void query.refetch()}>Повторить</Button>} />}
    {query.isLoading && <Typography.Paragraph role="status">Загрузка веткарты…</Typography.Paragraph>}
    {data && <article className="vet-print-root">
      <Typography.Title level={2}>Ветеринарная карта: {data.horse.name}</Typography.Title>
      <p>Порода: {data.horse.breed || '—'} · Год рождения: {data.horse.birthYear || '—'} · {data.horse.ownerType === 'private' ? 'Частная лошадь' : 'Лошадь клуба'}</p>
      <p>Статус: {healthStatuses[data.horse.healthStatus]}{data.horse.quarantineUntil && ` · Карантин до ${dateOnly(data.horse.quarantineUntil)}`}</p>
      <p>Сформировано: {dateOnly(data.generatedAt)} · Московское время · Внутренняя учётная карта клуба</p>
      <table className="vet-passport-table"><thead><tr><th>Дата</th><th>Процедура / препарат</th><th>Специалист</th><th>Следующий срок</th><th>Примечания</th></tr></thead>
        <tbody>{data.horse.vetRecords.map(r => <tr key={r.id}><td>{dateOnly(r.performedAt)}</td><td>{recordTypes[r.type]}: {r.title}<br />{r.medication}{r.cost != null && <div>{r.cost} ₽</div>}{r.documentUrl && <a href={r.documentUrl} target="_blank" rel="noopener noreferrer"> Документ</a>}</td><td>{r.specialist}</td><td>{r.nextDueDate ? dateOnly(r.nextDueDate) : '—'}</td><td>{r.notes}</td></tr>)}</tbody></table>
      {!data.horse.vetRecords.length && <p>Ветзаписей пока нет.</p>}
      <Typography.Title level={4}>Ранее внесённые процедуры и назначения</Typography.Title>
      {data.horse.vetEvents.map(e => <p key={e.id}>{dateOnly(e.eventDate)} · {legacyTypes[e.type] || 'Процедура'} · {legacyStatuses[e.status] || 'Назначение'} · {e.notes}</p>)}
      {data.horse.healthLogs.map(e => <p key={e.id}>{dateOnly(e.occurredAt)} · {legacyTypes[e.type] || 'Процедура'} · {e.notes}</p>)}
    </article>}
  </Modal>
}

export function VetRecordsJournal({ horseId, scope = 'horse' }: { horseId?: string; scope?: 'horse' | 'all' }) {
  const { role, permissions } = useRoleAccess()
  const manage = role === 'ADMIN' || role === 'MANAGER'
  const enabled = permissions.healthRead && (scope === 'all' || isHorseUuid(horseId))
  const [search, setSearch] = useSearchParams()
  const [localPage, setLocalPage] = useState(1)
  const [type, setType] = useState<RecordType>()
  const [horseFilter, setHorseFilter] = useState<string>()
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [bucket, setBucket] = useState<'overdue' | 'next14Days' | 'next30Days' | 'thisMonth'>()
  const [editor, setEditor] = useState<VetRecord | 'new'>()
  const [health, setHealth] = useState<VetHorse>()
  const [passport, setPassport] = useState<string>()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const { modal, message } = App.useApp()
  const { page, offset } = stablePagination(scope === 'all' ? search.get('page') : localPage)
  const setPage = (p: number) => scope === 'all' ? setSearch(previous => { previous.set('page', String(p)); return previous }) : setLocalPage(p)
  const params = new URLSearchParams({ offset: String(offset), limit: '20' })
  if (horseId || horseFilter) params.set('horseId', horseId || horseFilter!)
  if (type) params.set('type', type)
  if (range?.[0]) params.set('from', toInstant(`${range[0].format('YYYY-MM-DD')}T00:00`))
  if (range?.[1]) params.set('to', toInstant(`${range[1].format('YYYY-MM-DD')}T23:59:59.999`))
  const records = useStableList<VetRecord>(`vet/records?${params}`, { enabled, horseIdRequired: scope === 'horse' })
  const { query: summaryQuery } = useCustom<VetSummary>({ url: `${API_URL}/vet/summary`, method: 'get', errorNotification: false, queryOptions: { enabled: enabled && scope === 'all', retry: false } })
  const { query: horseQuery } = useCustom<VetHorse>({ url: `${API_URL}/horses/${horseId}`, method: 'get', errorNotification: false, queryOptions: { enabled: enabled && scope === 'horse', retry: false } })
  const { selectProps } = useSelect({ resource: 'horses', optionLabel: 'name', optionValue: 'id', pagination: { pageSize: 100 }, queryOptions: { enabled: enabled && scope === 'all', retry: false } })
  const summary = summaryQuery.data?.data
  const refresh = () => { records.refresh(); if (scope === 'all') void summaryQuery.refetch(); else void horseQuery.refetch() }
  if (!enabled) return <Alert type="info" message="Журнал здоровья недоступен" />
  const dueTag = (r: VetRecord) => r.nextDueDate ? <Tag className={`crm-tag crm-tag--${r.dueStatus === 'overdue' ? 'danger' : r.dueStatus === 'soon' ? 'warning' : 'success'}`}>{dateOnly(r.nextDueDate)} · {r.dueStatus === 'overdue' ? 'Просрочено' : r.dueStatus === 'soon' ? 'Скоро' : 'В графике'}</Tag> : '—'
  const remove = (r: VetRecord) => modal.confirm({ title: `Удалить «${r.title}»?`, content: 'Запись будет удалена из ветеринарной карты.', okText: 'Удалить', cancelText: 'Отмена', okButtonProps: { danger: true },
    onOk: async () => { setDeleting(true); setDeleteError(undefined); try { await httpClient.delete(`${API_URL}/vet/records/${r.id}`); refresh(); void message.success('Ветзапись удалена') }
      catch (error) { const failure = toHttpError(error); setDeleteError(failure.message); throw error } finally { setDeleting(false) } } })
  const actions = (r: VetRecord) => <Space wrap>{manage && <><Button size="small" onClick={() => setEditor(r)}>Редактировать</Button><Button size="small" onClick={() => setHealth(r.horse)}>Здоровье</Button></>}{role === 'ADMIN' && <Button size="small" danger disabled={deleting} onClick={() => remove(r)}>Удалить</Button>}</Space>
  const document = (r: VetRecord) => r.documentUrl && /^https?:\/\//i.test(r.documentUrl) ? <a href={r.documentUrl} target="_blank" rel="noopener noreferrer">Акт / скан</a> : '—'
  const procedure = (r: VetRecord) => <><strong>{r.title}</strong><div>{recordTypes[r.type]}</div><div>{r.medication}</div>{r.notes && <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</Typography.Paragraph>}{r.cost != null && <div>{r.cost} ₽</div>}</>
  return <section aria-label="Ветзаписи" className="stable-section">
    {scope === 'all' && <>
      {summaryQuery.isLoading && <p role="status">Загрузка сводки…</p>}
      {summaryQuery.isError && <Alert type="error" message="Не удалось загрузить сводку" action={<Button onClick={() => void summaryQuery.refetch()}>Повторить</Button>} />}
      {summary && <Space direction="vertical" style={{ width: '100%' }}>
        <Space wrap>{([['overdue', 'Просрочено', 'danger'], ['thisMonth', 'В этом месяце', 'warning'], ['next14Days', 'Ближайшие 14 дней', 'warning'], ['next30Days', 'Ближайшие 30 дней', 'success']] as const).map(([key, label, color]) => <Card key={key} size="small"><Button type="text" onClick={() => setBucket(bucket === key ? undefined : key)} aria-pressed={bucket === key}>{label} <Tag className={`crm-tag crm-tag--${color}`}>{summary[key]?.length ?? 0}</Tag></Button></Card>)}</Space>
        <Space wrap><strong>На карантине / лечении / выбыли:</strong>{summary.restrictedHorses?.length ? summary.restrictedHorses.map(h => <Button key={h.id} size="small" danger onClick={() => setPassport(h.id)}>{h.name} · {healthStatuses[h.healthStatus]}</Button>) : <span>Нет</span>}</Space>
        {bucket && <><Button onClick={() => setBucket(undefined)}>Закрыть список сроков</Button><List dataSource={summary[bucket]} locale={{ emptyText: 'Процедур в этом периоде нет' }} renderItem={r => <List.Item><Space wrap><Button type="link" onClick={() => setPassport(r.horseId)}>{r.horse.name}</Button><span>{r.title}</span><span>{r.nextDueDate && dateOnly(r.nextDueDate)}</span></Space></List.Item>} /></>}
      </Space>}
    </>}
    {horseQuery.data?.data && <Space wrap><Tag className={`crm-tag crm-tag--${horseQuery.data.data.healthStatus === 'HEALTHY' ? 'success' : 'danger'}`}>{healthStatuses[horseQuery.data.data.healthStatus || 'HEALTHY']}</Tag>
      {manage && <Button onClick={() => setHealth(horseQuery.data!.data)}>Карантин / больничный / здорова</Button>}<Button onClick={() => setPassport(horseId)}>Ветпаспорт / печать</Button></Space>}
    {horseQuery.isError && scope === 'horse' && <Alert type="error" message="Не удалось загрузить статус здоровья" action={<Button onClick={() => void horseQuery.refetch()}>Повторить</Button>} />}
    <Space wrap>
      <Select aria-label="Тип ветзаписи" placeholder="Все типы" allowClear value={type} style={{ minWidth: 180 }} options={Object.entries(recordTypes).map(([value, label]) => ({ value, label }))} onChange={v => { setType(v); setPage(1) }} />
      {scope === 'all' && <Select<string> options={selectProps.options} loading={selectProps.loading} aria-label="Лошадь в ветжурнале" placeholder="Все лошади" showSearch optionFilterProp="label" allowClear value={horseFilter} style={{ minWidth: 180 }} onSearch={selectProps.onSearch} onChange={v => { setHorseFilter(v); setPage(1) }} />}
      <DatePicker.RangePicker aria-label="Период проведения" locale={ruDatePicker} format="DD.MM.YYYY" value={range} onChange={r => { setRange(r); setPage(1) }} />
      {manage && <Button type="primary" onClick={() => setEditor('new')}>Добавить ветзапись</Button>}
    </Space>
    {deleteError && <Alert type="error" message="Не удалось удалить ветзапись" description={deleteError} />}
    <StableListState {...records} total={records.result?.total || 0} page={page} onPage={setPage} refresh={refresh}>
      {scope === 'horse' ? <Timeline items={records.result?.data.map(r => ({ children: <Space direction="vertical"><strong>{dateOnly(r.performedAt)}</strong>{procedure(r)}<span>Специалист: {r.specialist}</span><span>Следующий срок: {dueTag(r)}</span>{document(r)}{actions(r)}</Space> }))} /> : <ResponsiveTable<VetRecord> rowKey="id" dataSource={records.result?.data} pagination={false} scroll={{ x: 1100 }} columns={[
        { title: 'Дата проведения', key: 'date', render: (_, r) => dateOnly(r.performedAt) },
        { title: 'Лошадь', key: 'horse', render: (_, r) => <Button type="link" onClick={() => setPassport(r.horseId)}>{r.horse.name}</Button> },
        { title: 'Процедура / препарат', key: 'title', render: (_, r) => procedure(r) },
        { title: 'Следующий срок', key: 'due', render: (_, r) => dueTag(r) }, { title: 'Специалист', dataIndex: 'specialist' },
        { title: 'Документ', key: 'document', render: (_, r) => document(r) },
        { title: 'Действия', key: 'actions', render: (_, r) => actions(r) },
      ]} />}
    </StableListState>
    {editor && <VetRecordForm horseId={horseId} record={editor === 'new' ? undefined : editor} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); refresh() }} />}
    {health && <HealthEditor horse={health} onClose={() => setHealth(undefined)} onSaved={() => { setHealth(undefined); refresh() }} />}
    {passport && <VetPassport horseId={passport} onClose={() => setPassport(undefined)} />}
  </section>
}
