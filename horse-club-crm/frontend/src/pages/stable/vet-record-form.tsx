import { useState } from 'react'
import { useSelect } from '@refinedev/antd'
import { DatePicker, Form, Input, InputNumber, Select, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { DateTime } from 'luxon'
import { API_URL, httpClient } from '../../httpClient'
import { toInstant } from '../schedule/time'
import { StableEntryModal } from './shared'
import { recordIntervals, recordTemplates, recordTypes, type RecordType, type VetRecord } from './vet-record-types'

type Values = { horseId?: string; horseIds?: string[]; type: RecordType; title: string; performedAt: Dayjs; nextDueDate?: Dayjs | null; specialist: string; medication?: string; notes?: string; cost?: number | null; documentUrl?: string }
const instant = (d: Dayjs) => toInstant(`${d.format('YYYY-MM-DD')}T12:00`)
export function VetRecordForm({ horseId, record, onClose, onSaved }: { horseId?: string; record?: VetRecord; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<Values>()
  const [manualDue, setManualDue] = useState(Boolean(record))
  const [batch, setBatch] = useState(false)
  const type = Form.useWatch('type', form) || record?.type || 'FARRIER'
  const { selectProps } = useSelect({ resource: 'horses', optionLabel: 'name', optionValue: 'id', pagination: { pageSize: 100 }, queryOptions: { enabled: !horseId, retry: false } })
  const date = (s: string) => dayjs(DateTime.fromISO(s, { zone: 'Europe/Moscow' }).toISODate())
  const today = dayjs(DateTime.now().setZone('Europe/Moscow').toISODate())
  return <StableEntryModal title={record ? 'Редактировать ветзапись' : 'Добавить ветеринарную запись'} form={form} submitLabel="Сохранить ветзапись" onClose={onClose} onSaved={onSaved}
    save={values => {
      const { horseIds, performedAt, nextDueDate, ...fields } = values
      const performedInstant = record && performedAt.isSame(date(record.performedAt), 'day') ? record.performedAt
        : performedAt.isSame(today, 'day') ? new Date().toISOString() : instant(performedAt)
      const payload = { ...fields, horseId: horseId || values.horseId, performedAt: performedInstant,
        nextDueDate: nextDueDate ? instant(nextDueDate) : manualDue ? null : undefined,
        medication: values.medication || null, notes: values.notes || null, documentUrl: values.documentUrl || null, cost: values.cost ?? null }
      return record ? httpClient.patch(`${API_URL}/vet/records/${record.id}`, payload)
        : batch ? httpClient.post(`${API_URL}/vet/records/batch`, { ...payload, horseId: undefined, horseIds }) : httpClient.post(`${API_URL}/vet/records`, payload)
    }}>
    {(horseId || record) && <Form.Item hidden name="horseId" initialValue={horseId || record?.horseId}><Input /></Form.Item>}
    {!horseId && !record && <>
      <Form.Item label="Режим записи"><Select aria-label="Режим записи" value={batch ? 'batch' : 'single'} options={[{ value: 'single', label: 'Одна лошадь' }, { value: 'batch', label: 'Массовая вакцинация / глистогон' }]}
        onChange={value => { setBatch(value === 'batch'); if (value === 'batch' && !['VACCINATION', 'DEWORMING'].includes(type)) form.setFieldsValue({ type: 'VACCINATION', title: undefined, nextDueDate: (form.getFieldValue('performedAt') || today).add(365, 'day') }) }} /></Form.Item>
      <Form.Item name={batch ? 'horseIds' : 'horseId'} label={batch ? 'Лошади' : 'Лошадь'} rules={[{ required: true, message: 'Выберите лошадь' }]}>
        <Select {...selectProps} aria-label={batch ? 'Лошади' : 'Лошадь'} mode={batch ? 'multiple' : undefined} showSearch optionFilterProp="label" />
      </Form.Item>
    </>}
    <Form.Item name="type" label="Тип процедуры" initialValue={record?.type || 'FARRIER'} rules={[{ required: true }]}><Select aria-label="Тип процедуры" options={Object.entries(recordTypes).filter(([key]) => !batch || ['VACCINATION', 'DEWORMING'].includes(key)).map(([value, label]) => ({ value, label }))}
      onChange={(next: RecordType) => { form.setFieldsValue({ title: undefined }); if (!manualDue) form.setFieldsValue({ nextDueDate: recordIntervals[next] ? (form.getFieldValue('performedAt') || today).add(recordIntervals[next], 'day') : null }) }} /></Form.Item>
    <Form.Item label="Частый шаблон"><Select aria-label="Частый шаблон" placeholder="Выберите или заполните название ниже" value={undefined} options={(recordTemplates[type as RecordType] || []).map(label => ({ value: label, label }))} onChange={title => form.setFieldsValue({ title })} /></Form.Item>
    <Form.Item name="title" label="Название процедуры" initialValue={record?.title} rules={[{ required: true, whitespace: true, message: 'Укажите название процедуры' }, { max: 250 }]}><Input maxLength={250} /></Form.Item>
    <Form.Item name="performedAt" label="Дата проведения (Москва)" initialValue={record ? date(record.performedAt) : today} rules={[{ required: true, message: 'Укажите дату' }]}><DatePicker locale={ruDatePicker} format="DD.MM.YYYY" style={{ width: '100%' }} disabledDate={d => d.isAfter(today, 'day')}
      onChange={d => { if (d && !manualDue) form.setFieldsValue({ nextDueDate: recordIntervals[type as RecordType] ? d.add(recordIntervals[type as RecordType]!, 'day') : null }) }} /></Form.Item>
    <Form.Item name="nextDueDate" label="Следующая процедура" initialValue={record?.nextDueDate ? date(record.nextDueDate) : record ? null : today.add(45, 'day')}><DatePicker locale={ruDatePicker} format="DD.MM.YYYY" style={{ width: '100%' }} onChange={() => setManualDue(true)} /></Form.Item>
    <Typography.Paragraph type="secondary">Период — рабочая подсказка, его можно изменить по назначению врача. Очистите дату, чтобы отключить напоминание. Кровь: по умолчанию 180 дней, при необходимости укажите 365.</Typography.Paragraph>
    <Form.Item name="specialist" label="Врач / коваль / лаборатория" initialValue={record?.specialist} rules={[{ required: true, whitespace: true, message: 'Укажите специалиста' }, { max: 200 }]}><Input maxLength={200} /></Form.Item>
    <Form.Item name="medication" label="Препарат, дозировка, серия" initialValue={record?.medication}><Input maxLength={1000} /></Form.Item>
    <Form.Item name="notes" label="Комментарий / ограничения нагрузки" initialValue={record?.notes}><Input.TextArea maxLength={10000} autoSize={{ minRows: 3, maxRows: 8 }} /></Form.Item>
    <Form.Item name="cost" label="Стоимость одной процедуры, ₽" initialValue={record?.cost == null ? null : Number(record.cost)}><InputNumber min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} /></Form.Item>
    <Form.Item name="documentUrl" label="Ссылка на акт / скан" initialValue={record?.documentUrl} rules={[{ type: 'url', message: 'Укажите полную ссылку http:// или https://' }, { pattern: /^https?:\/\//i, message: 'Допустимы ссылки http:// и https://' }]}><Input maxLength={2000} /></Form.Item>
  </StableEntryModal>
}
