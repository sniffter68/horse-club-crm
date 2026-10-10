import { useRef, useState } from 'react'
import { Alert, App, Form, Modal } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { ClientIdentityFields } from './identity'
import { clientIdentityPayload, type ClientIdentityValues } from './identityPayload'

export type CreatedClient = { id: string; name: string; phone?: string; firstName?: string; lastName?: string }

export function QuickCreateClientModal({ initialQuery, onCreated, onCancel }: {
  initialQuery: string; onCreated: (client: CreatedClient) => void; onCancel: () => void
}) {
  const [form] = Form.useForm<ClientIdentityValues>()
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const pending = useRef(false)
  const query = initialQuery.trim()
  const isPhone = /^\+?[\d\s().-]+$/.test(query) && /\d/.test(query)
  const save = async (values: ClientIdentityValues) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(undefined)
    try {
      const { data } = await httpClient.post<CreatedClient>(`${API_URL}/clients`, {
        ...clientIdentityPayload(values), isRider: true, isPayer: false,
      })
      void message.success('Клиент создан')
      onCreated(data)
    } catch (cause) {
      setError(toHttpError(cause).message)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return <Modal open title="Новый клиент" okText="Создать клиента" cancelText="Отмена" maskClosable={false}
    focusTriggerAfterClose={false} confirmLoading={busy} closable={!busy} keyboard={!busy}
    cancelButtonProps={{ disabled: busy }} onCancel={() => { if (!pending.current) onCancel() }}
    onOk={() => form.submit()} afterOpenChange={open => { if (open) form.scrollToField(!query || isPhone ? 'firstName' : 'phone', { focus: true }) }}>
    {error && <Alert role="alert" type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Form form={form} layout="vertical" noValidate disabled={busy} scrollToFirstError={{ focus: true }}
      initialValues={{ firstName: isPhone ? '' : query, phone: isPhone ? query : '' }} onFinish={save}>
      <ClientIdentityFields />
    </Form>
  </Modal>
}
