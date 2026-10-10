import { useCallback, useEffect, useRef, useState } from 'react'
import { useInvalidate, useOnError, usePermissions } from '@refinedev/core'
import { Alert, App, Button, Card, Checkbox, Col, Divider, Form, Input, InputNumber, List, Modal, Row, Select, Space, Tag, Typography } from 'antd'
import type { Role } from '../../authStorage'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { CLUB_TIME_ZONE, toInstant } from '../schedule/time'
import { useTriadAvailability } from '../schedule/useTriadAvailability'
import { leadConversionPayload, type LeadFormValues } from './leadConversion'
import { useLeadLessonCatalogs } from './useLeadLessonCatalogs'

export interface PendingLead {
  id: string
  firstName: string
  phone: string
  email: string | null
  preferences: string | null
  createdAt: string
  service: { id: string; name: string; title: string } | null
}

const submittedAt = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow',
})
const stopPopupEscape = (event: { key: string; stopPropagation: () => void }) => { if (event.key === 'Escape') event.stopPropagation() }

export function PendingLeads({ leads, loading, onProcessed }: {
  leads: PendingLead[]
  loading: boolean
  onProcessed: (id: string) => void
}) {
  const { data: role } = usePermissions<Role>({})
  const invalidate = useInvalidate()
  const { mutate: onError } = useOnError()
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])
  const { message, modal } = App.useApp()
  const [selected, setSelected] = useState<PendingLead>()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const dirty = useRef(false)
  const [form] = Form.useForm<LeadFormValues>()
  const assignLesson = Form.useWatch('assignLesson', form)
  const lesson = Form.useWatch('lesson', form) as LeadFormValues['lesson']
  const report = useCallback((cause: unknown) => {
    const error = toHttpError(cause)
    setFailure(error.message)
    if (error.statusCode === 401) onErrorRef.current(error)
  }, [])
  const catalogs = useLeadLessonCatalogs(Boolean(selected && assignLesson), revision, report)
  let from: string | undefined, to: string | undefined
  try {
    if (selected && assignLesson && lesson?.startTime && lesson.durationMinutes > 0) {
      from = toInstant(lesson.startTime)
      to = new Date(+new Date(from) + lesson.durationMinutes * 60000).toISOString()
    }
  } catch { /* Form validation owns invalid dates. */ }
  const availability = useTriadAvailability(from, to, revision, report)
  const loads = availability.data?.horseWorkloads ?? []
  const horseBlocked = (horseId: string) => {
    const load = loads.find(row => row.horseId === horseId)
    return !load || load.status !== 'AVAILABLE' || load.currentWorkloadMinutes + (lesson?.durationMinutes ?? 0) > load.maxDailyWorkloadMinutes
  }
  const schedulingBlocked = Boolean(assignLesson && (catalogs.loading || catalogs.error
    || (from && (availability.loading || availability.error || !availability.data))
    || (lesson?.horseId && horseBlocked(lesson.horseId))))

  if (role !== 'ADMIN') return null

  const open = (lead: PendingLead) => {
    setSelected(lead)
    setFailure(undefined)
    dirty.current = false
    form.resetFields()
    form.setFieldsValue({
      firstName: lead.firstName, lastName: '', phone: lead.phone,
      email: lead.email ?? '', preferences: lead.preferences ?? '', isRider: true, isPayer: false,
      assignLesson: false, lesson: { serviceId: lead.service?.id, durationMinutes: 60 },
    })
  }

  const close = () => {
    if (lock.current) return
    if (!dirty.current) { setSelected(undefined); return }
    modal.confirm({ title: 'Закрыть заявку без сохранения?', content: 'Введённые изменения будут потеряны.',
      okText: 'Закрыть без сохранения', cancelText: 'Продолжить заполнение', onOk: () => setSelected(undefined) })
  }

  const accept = async (values: LeadFormValues) => {
    if (!selected || lock.current || schedulingBlocked) return
    lock.current = true
    setFailure(undefined)
    setSaving(true)
    try {
      await httpClient.patch(`${API_URL}/leads/${selected.id}/accept`, leadConversionPayload(values))
      onProcessed(selected.id)
      for (const resource of ['clients', 'lessons', 'bookings']) void invalidate({ resource, invalidates: ['list'] })
      setSelected(undefined)
      void message.success(values.assignLesson ? 'Клиент создан, занятие назначено' : 'Заявка сохранена как клиент')
    } catch (cause) {
      report(cause)
      setRevision(value => value + 1)
    } finally {
      setSaving(false)
      lock.current = false
    }
  }

  const reject = () => {
    if (!selected) return
    modal.confirm({
      title: 'Отклонить заявку?',
      content: 'Заявка исчезнет с дашборда, клиент создан не будет.',
      okText: 'Отклонить', okButtonProps: { danger: true }, cancelText: 'Отмена',
      onOk: async () => {
        if (lock.current) return
        lock.current = true
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
          lock.current = false
        }
      },
    })
  }

  return <>
    <Card id="pending-leads" title={<Space>Новые заявки <Tag className={leads.length ? 'crm-tag crm-tag--accent' : undefined}>{leads.length}</Tag></Space>}>
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

    <Modal title="Обработка заявки" open={Boolean(selected)} width={640} destroyOnHidden maskClosable={false}
      closable={!saving} keyboard={!saving} onCancel={close} footer={[
        <Button key="reject" danger disabled={saving} onClick={reject}>Отклонить</Button>,
        <Button key="cancel" disabled={saving} onClick={close}>Отмена</Button>,
        <Button key="accept" type="primary" aria-label={assignLesson ? 'Создать клиента и назначить занятие' : 'Создать клиента'} loading={saving} disabled={saving || schedulingBlocked} onClick={() => form.submit()} style={{ whiteSpace: 'normal', height: 'auto', minHeight: 40 }}>{assignLesson ? 'Создать клиента и назначить занятие' : 'Создать клиента'}</Button>,
      ]}>
      <Form<LeadFormValues> form={form} layout="vertical" noValidate onValuesChange={() => { dirty.current = true }} onFinish={accept} disabled={saving} scrollToFirstError={{ focus: true }}>
        {failure && <Alert type="error" showIcon message={failure} style={{ marginBottom: 16 }} />}
        <Space align="start" wrap style={{ width: '100%' }}>
          <Form.Item name="firstName" label="Имя" rules={[{ required: true, whitespace: true, message: 'Укажите имя' }]} style={{ minWidth: 240, flex: 1 }}><Input maxLength={75} /></Form.Item>
          <Form.Item name="lastName" label="Фамилия" style={{ minWidth: 240, flex: 1 }}><Input maxLength={74} /></Form.Item>
        </Space>
        <Form.Item name="phone" label="Телефон" rules={[{ required: true, message: 'Укажите телефон' }, { pattern: /^\+[1-9]\d{6,14}$/, message: 'Формат: +79991234567' }]}><Input maxLength={16} /></Form.Item>
        <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Некорректный email' }]}><Input maxLength={254} /></Form.Item>
        <Form.Item name="preferences" label="Комментарий"><Input.TextArea rows={4} maxLength={5000} style={{ resize: 'none' }} /></Form.Item>
        {selected?.service && <Form.Item label="Выбранная услуга"><Tag className="crm-tag crm-tag--accent">{selected.service.title || selected.service.name}</Tag></Form.Item>}
        <Space wrap>
          <Form.Item name="isRider" valuePropName="checked" noStyle><Checkbox disabled={saving || assignLesson}>Всадник</Checkbox></Form.Item>
          <Form.Item name="isPayer" valuePropName="checked" noStyle><Checkbox>Плательщик</Checkbox></Form.Item>
        </Space>
        <Divider />
        <Form.Item name="assignLesson" valuePropName="checked">
          <Checkbox onChange={event => { if (event.target.checked) form.setFieldValue('isRider', true) }}>Сразу назначить тренировку</Checkbox>
        </Form.Item>
        {assignLesson && <>
          <Typography.Paragraph type="secondary">Время клуба: {CLUB_TIME_ZONE}. Занятие появится в расписании после сохранения.</Typography.Paragraph>
          {catalogs.error && <Alert type="error" showIcon message={catalogs.error} action={<Button onClick={() => setRevision(value => value + 1)}>Повторить загрузку</Button>} />}
          <Row gutter={16}>
            <Col xs={24} sm={16}><Form.Item name={['lesson', 'startTime']} label="Дата и время" rules={[{ required: true, message: 'Укажите дату и время' }, { validator: async (_, value: string) => { if (value) toInstant(value) } }]}>
              <Input type="datetime-local" />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name={['lesson', 'durationMinutes']} label="Длительность, мин" rules={[{ required: true, message: 'Укажите длительность' }]}>
              <InputNumber controls={false} min={1} max={480} precision={0} style={{ width: '100%' }} />
            </Form.Item></Col>
          </Row>
          <Form.Item name={['lesson', 'serviceId']} label="Услуга" rules={[{ required: true, message: 'Выберите услугу' }]}>
            <Select onKeyDown={stopPopupEscape} showSearch optionFilterProp="label" loading={catalogs.loading} placeholder="Выберите услугу" notFoundContent="Услуг нет"
              options={catalogs.services.map(row => ({ value: row.id, label: row.title || row.name }))}
              onChange={id => { const service = catalogs.services.find(row => row.id === id); if (service) form.setFieldValue(['lesson', 'durationMinutes'], service.durationMinutes) }} />
          </Form.Item>
          <Form.Item name={['lesson', 'trainerId']} label="Тренер" rules={[{ required: true, message: 'Выберите тренера' }]}>
            <Select onKeyDown={stopPopupEscape} showSearch optionFilterProp="label" loading={catalogs.loading} placeholder="Выберите тренера" notFoundContent="Активных тренеров нет"
              options={catalogs.trainers.map(row => ({ value: row.id, label: row.fullName || row.name }))} />
          </Form.Item>
          <Form.Item name={['lesson', 'horseId']} label="Лошадь" rules={[{ required: true, message: 'Выберите лошадь' }]}>
            <Select onKeyDown={stopPopupEscape} showSearch optionFilterProp="label" loading={catalogs.loading || availability.loading} placeholder="Выберите лошадь" notFoundContent="Доступных лошадей нет"
              options={catalogs.horses.map(row => ({ value: row.id, label: row.name, disabled: !from || horseBlocked(row.id) }))} />
          </Form.Item>
          {lesson?.horseId && !availability.loading && availability.data && horseBlocked(lesson.horseId) && <Alert type="warning" showIcon message="Лошадь недоступна или будет превышена её дневная нагрузка. Измените время или выберите другую лошадь." />}
          {availability.error && <Alert type="error" showIcon message={availability.error} action={<Button onClick={() => setRevision(value => value + 1)}>Проверить снова</Button>} />}
          <Form.Item name={['lesson', 'arenaId']} label="Манеж / локация">
            <Select onKeyDown={stopPopupEscape} allowClear showSearch optionFilterProp="label" loading={catalogs.loading} placeholder="Без указания локации" notFoundContent="Доступных локаций нет"
              options={catalogs.arenas.map(row => ({ value: row.id, label: row.name }))} />
          </Form.Item>
        </>}
      </Form>
    </Modal>
  </>
}
