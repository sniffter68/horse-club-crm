import { useState } from 'react'
import { usePermissions } from '@refinedev/core'
import { App, Button, Card, Checkbox, Form, Input, List, Modal, Space, Tag, Typography } from 'antd'
import type { Role } from '../../authStorage'
import { API_URL, httpClient, toHttpError } from '../../httpClient'

export interface PendingLead {
  id: string
  firstName: string
  phone: string
  email: string | null
  preferences: string | null
  createdAt: string
  service: { id: string; name: string; title: string } | null
}

interface LeadFormValues {
  firstName: string
  lastName?: string
  phone: string
  email?: string
  preferences?: string
  isRider: boolean
  isPayer: boolean
}

const submittedAt = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow',
})

export function PendingLeads({ leads, loading, onProcessed }: {
  leads: PendingLead[]
  loading: boolean
  onProcessed: (id: string) => void
}) {
  const { data: role } = usePermissions<Role>({})
  const { message, modal } = App.useApp()
  const [selected, setSelected] = useState<PendingLead>()
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<LeadFormValues>()

  if (role !== 'ADMIN') return null

  const open = (lead: PendingLead) => {
    setSelected(lead)
    form.setFieldsValue({
      firstName: lead.firstName, lastName: '', phone: lead.phone,
      email: lead.email ?? '', preferences: lead.preferences ?? '', isRider: true, isPayer: false,
    })
  }

  const accept = async (values: LeadFormValues) => {
    if (!selected) return
    setSaving(true)
    try {
      await httpClient.patch(`${API_URL}/leads/${selected.id}/accept`, {
        ...values,
        lastName: values.lastName?.trim() || undefined,
        email: values.email?.trim() || undefined,
        preferences: values.preferences?.trim() || undefined,
      })
      onProcessed(selected.id)
      setSelected(undefined)
      void message.success('Заявка сохранена как клиент')
    } catch (cause) {
      void message.error(toHttpError(cause).message)
    } finally {
      setSaving(false)
    }
  }

  const reject = () => {
    if (!selected) return
    modal.confirm({
      title: 'Отклонить заявку?',
      content: 'Заявка исчезнет с дашборда, клиент создан не будет.',
      okText: 'Отклонить', okButtonProps: { danger: true }, cancelText: 'Отмена',
      onOk: async () => {
        setSaving(true)
        try {
          await httpClient.patch(`${API_URL}/leads/${selected.id}/reject`)
          onProcessed(selected.id)
          setSelected(undefined)
          void message.success('Заявка отклонена')
        } catch (cause) {
          void message.error(toHttpError(cause).message)
        } finally {
          setSaving(false)
        }
      },
    })
  }

  return <>
    <Card id="pending-leads" title={<Space>Новые заявки <Tag color={leads.length ? 'blue' : 'default'}>{leads.length}</Tag></Space>}>
      <List<PendingLead> loading={loading} dataSource={leads} locale={{ emptyText: 'Необработанных заявок нет' }}
        renderItem={lead => <List.Item actions={[<Button type="primary" key="open" onClick={() => open(lead)}>Открыть</Button>]}>
          <List.Item.Meta title={lead.firstName} description={<Space direction="vertical" size={2}>
            <a href={`tel:${lead.phone}`}>{lead.phone}</a>
            <Typography.Text>{lead.service?.title || lead.service?.name || 'Услуга не выбрана'}</Typography.Text>
            <Typography.Text type="secondary">{submittedAt.format(new Date(lead.createdAt))}</Typography.Text>
          </Space>} />
        </List.Item>}
      />
    </Card>

    <Modal title="Обработка заявки" open={Boolean(selected)} width={640} destroyOnHidden
      onCancel={() => setSelected(undefined)} footer={[
        <Button key="reject" danger disabled={saving} onClick={reject}>Отклонить</Button>,
        <Button key="cancel" disabled={saving} onClick={() => setSelected(undefined)}>Отмена</Button>,
        <Button key="accept" type="primary" loading={saving} onClick={() => form.submit()}>Создать клиента</Button>,
      ]}>
      <Form<LeadFormValues> form={form} layout="vertical" onFinish={accept}>
        <Space align="start" wrap style={{ width: '100%' }}>
          <Form.Item name="firstName" label="Имя" rules={[{ required: true, whitespace: true, message: 'Укажите имя' }]} style={{ minWidth: 240, flex: 1 }}><Input maxLength={75} /></Form.Item>
          <Form.Item name="lastName" label="Фамилия" style={{ minWidth: 240, flex: 1 }}><Input maxLength={74} /></Form.Item>
        </Space>
        <Form.Item name="phone" label="Телефон" rules={[{ required: true, message: 'Укажите телефон' }, { pattern: /^\+[1-9]\d{6,14}$/, message: 'Формат: +79991234567' }]}><Input maxLength={16} /></Form.Item>
        <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Некорректный email' }]}><Input maxLength={254} /></Form.Item>
        <Form.Item name="preferences" label="Комментарий"><Input.TextArea rows={4} maxLength={5000} /></Form.Item>
        {selected?.service && <Form.Item label="Выбранная услуга"><Tag color="blue">{selected.service.title || selected.service.name}</Tag></Form.Item>}
        <Space wrap>
          <Form.Item name="isRider" valuePropName="checked" noStyle><Checkbox>Всадник</Checkbox></Form.Item>
          <Form.Item name="isPayer" valuePropName="checked" noStyle><Checkbox>Плательщик</Checkbox></Form.Item>
        </Space>
      </Form>
    </Modal>
  </>
}
