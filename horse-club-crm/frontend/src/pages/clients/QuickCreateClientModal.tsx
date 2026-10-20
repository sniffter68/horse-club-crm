import { useRef, useState } from 'react'
import { Alert, App, Form, Input, Modal, Select } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'

export type CreatedClient = { id: string; name: string; phone?: string | null; firstName?: string; lastName?: string; clientType?: 'REGULAR' | 'ONE_TIME'; riderLevel?: string | null }
type Values = { name: string; phone?: string; riderLevel?: string }
export function QuickCreateClientModal({ initialQuery, isOneTime = false, onCreated, onCancel }: {
  initialQuery: string; isOneTime?: boolean; onCreated: (client: CreatedClient) => void; onCancel: () => void
}) {
  const [form] = Form.useForm<Values>()
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const pending = useRef(false)
  const query = initialQuery.trim()
  const isPhone = /^\+?[\d\s().-]+$/.test(query) && /\d/.test(query)
  const save = async (values: Values) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(undefined)
    try {
      const { data } = await httpClient.post<CreatedClient>(`${API_URL}/clients/quick`, {
        ...values, name: values.name.trim().replace(/\s+/g, ' '), phone: values.phone?.trim() || undefined, isOneTime,
      })
      void message.success('Клиент создан'); onCreated(data)
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { pending.current = false; setBusy(false) }
  }
  return <Modal open title={isOneTime ? 'Разовый гость' : 'Постоянный клиент'} okText="Создать и выбрать" cancelText="Отмена" maskClosable={false}
    confirmLoading={busy} closable={!busy} keyboard={!busy} cancelButtonProps={{ disabled: busy }}
    onCancel={() => { if (!pending.current) onCancel() }} onOk={() => form.submit()}
    afterOpenChange={open => { if (open) form.scrollToField('name', { focus: true }) }}>
    {error && <Alert role="alert" type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Form form={form} name="quickClient" layout="vertical" noValidate disabled={busy} scrollToFirstError={{ focus: true }}
      initialValues={{ name: isPhone ? '' : query, phone: isPhone ? query : '' }} onFinish={save}>
      <Form.Item name="name" label={isOneTime ? 'Имя' : 'ФИО'} rules={[{ required: true, whitespace: true, message: 'Введите имя клиента' }]}><Input aria-label={isOneTime ? 'Имя' : 'ФИО'} maxLength={150} /></Form.Item>
      <Form.Item name="phone" label="Телефон" extra="Необязательно"><Input aria-label="Телефон" type="tel" maxLength={40} /></Form.Item>
      {!isOneTime && <Form.Item name="riderLevel" label="Уровень всадника"><Select allowClear options={[
        { value: 'BEGINNER', label: 'Начинающий' }, { value: 'INTERMEDIATE', label: 'Средний' }, { value: 'ADVANCED', label: 'Опытный' },
      ]} /></Form.Item>}
    </Form>
  </Modal>
}
