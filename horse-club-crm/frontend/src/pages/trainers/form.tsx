import { PublicationFields } from '../catalogs/PublicationFields'
import { useCatalogPermissions } from '../catalogs/permissions'
import { CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Trainer, TrainerValues } from '../catalogs/types'
import { usePermissions } from '../../modulePermissions'
import { PhoneField } from '../../components/PhoneField'
import { phonePayload } from '../../components/formatPhone'
import { Button, Form, Input, InputNumber, Space } from 'antd'
import { VkProfileField } from '../../components/VkProfileLink'

export function TrainerForm({ action }: { action: 'create' | 'edit' }) {
  const { canManage } = useCatalogPermissions()
  const { canWrite } = usePermissions()
  const editRate = canManage && canWrite('STAFF_PAYROLL')
  return <CatalogForm<Trainer, TrainerValues> resource="trainers" action={action}
    title={action === 'create' ? 'Новый тренер' : 'Редактирование тренера'} defaults={{ isPublic: true, order: 0, maxDailyLoad: 480, maxParallelLessons: 4, baseRate: 0, commissionPercent: 30 }}
    toPayload={({ baseRate, commissionPercent, ...values }) => ({ ...values, vkId: values.vkId?.trim() || null, phone: phonePayload(values.phone), ...(editRate ? { baseRate: Number(baseRate), commissionPercent: Number(commissionPercent ?? 30) } : {}) })}>
    <TextField name="name" label="ФИО" required />
    <PhoneField />
    <VkProfileField label="VK ID" />
    <Form.Item name="scheduleColor" label="Цвет в расписании" rules={[{ pattern: /^#[0-9a-fA-F]{6}$/, message: 'Укажите цвет в формате #724C39' }]}><Input aria-label="Цвет в расписании" placeholder="#724C39" maxLength={7} /></Form.Item>
    <TextField name="qualification" label="Роль / специализация" multiline max={1000} />
    <NumberField name="maxDailyLoad" label="Дневная нагрузка, мин" min={1} />
    <NumberField name="maxParallelLessons" label="Максимум одновременных всадников" min={1} max={100} />
    {editRate && <NumberField name="baseRate" label="Базовая ставка, ₽" precision={2} max={9999999999.99} />}
    {editRate && <TrainerCommissionField />}
    <PublicationFields />
  </CatalogForm>
}

function TrainerCommissionField() {
  const form = Form.useFormInstance<TrainerValues>()
  return <>
    <Form.Item name="commissionPercent" label="Ставка тренера, %" initialValue={30} getValueProps={value => ({ value: value == null ? undefined : Number(value) })} rules={[{ required: true, transform: value => value == null ? value : Number(value), type: 'number', min: 0, max: 100, message: 'Укажите ставку от 0 до 100%' }]}>
      <InputNumber aria-label="Ставка тренера, %" min={0} max={100} precision={2} />
    </Form.Item>
    <Space wrap style={{ marginBottom: 24 }} aria-label="Быстрый выбор ставки">
      {[30, 50, 100].map(value => <Button key={value} onClick={() => form.setFieldValue('commissionPercent', value)}>{value}%</Button>)}
    </Space>
  </>
}
