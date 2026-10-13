import { useState } from 'react'
import { Button, Form, Select, Typography } from 'antd'
import type { Horse } from '../catalogs/types'
import { StableEntryModal } from './shared'
import { API_URL, httpClient } from '../../httpClient'
import { horseStatuses } from './types'

export function HorseStatusEditor({ horse }: { horse: Horse }) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<{ status: NonNullable<Horse['status']> }>()
  return <><Button size="small" onClick={() => { form.setFieldsValue({ status: horse.status || (horse.isUnavailable ? 'rest' : 'active') }); setOpen(true) }}>Изменить статус лошади</Button>
    {open && <StableEntryModal title={`Статус: ${horse.name}`} form={form} submitLabel="Сохранить статус" onClose={() => setOpen(false)} onSaved={() => setOpen(false)}
      save={values => httpClient.patch(`${API_URL}/horses/${horse.id}`, values)}>
      <Typography.Paragraph>Отдых, болезнь и карантин запрещают новые бронирования. Уже запланированные занятия нужно отменить или перенести отдельно.</Typography.Paragraph>
      <Form.Item name="status" label="Статус лошади" rules={[{ required: true }]}><Select options={Object.entries(horseStatuses).map(([value, label]) => ({ value, label }))} /></Form.Item>
    </StableEntryModal>}
  </>
}
