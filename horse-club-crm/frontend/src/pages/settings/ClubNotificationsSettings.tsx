import { useEffect } from 'react'
import { Alert, Button, Card, Form, Select, Space, Spin, TimePicker, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ToggleSettingRow } from '../../components/ToggleSettingRow'
import { useCatalogPermissions } from '../catalogs/permissions'
import { useClubSettings } from './useClubSettings'

interface NotificationSettings {
  clientReminder24h: boolean; clientReminder2h: boolean;
  trainerNewBooking: boolean; trainerCancellation: boolean;
  adminDigest: boolean; adminDigestTime: string; adminRecipientIds: string[];
}
type NotificationForm = Omit<NotificationSettings, 'adminDigestTime'> & { adminDigestTime: Dayjs | null }

export function ClubNotificationsSettings() {
  const { canManage, isLoading } = useCatalogPermissions('schedule')
  const state = useClubSettings<NotificationSettings>('notifications', 'Настройки уведомлений сохранены')
  const recipients = useClubSettings<{ id: string; email: string }[]>('notification-recipients', '')
  const [form] = Form.useForm<NotificationForm>()
  const digest = Form.useWatch('adminDigest', { form, preserve: true }) as boolean | undefined
  useEffect(() => {
    if (state.value) form.setFieldsValue({ ...state.value, adminDigestTime: dayjs(`2000-01-01T${state.value.adminDigestTime}:00`) })
  }, [state.value, form])
  return <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 760 }}>
    <Typography.Title level={2}>Уведомления клуба</Typography.Title>
    <Typography.Text type="secondary">Напоминания клиентам и уведомления тренерам — через VK. Сводки администраторам — в Telegram. Время сводки — московское.</Typography.Text>
    {state.error && <Alert type="error" showIcon message={state.error} action={!state.value && <Button onClick={state.retry}>Повторить</Button>} />}
    {!canManage && !isLoading && <Alert type="info" showIcon message="Доступ только для чтения" />}
    <Card><Spin spinning={state.loading || isLoading}>
      <Form noValidate form={form} layout="vertical" disabled={!canManage || !state.value || state.saving} onFinish={async () => {
        if (!canManage) return
        const values = form.getFieldsValue(true) as NotificationForm
        await state.save({ clientReminder24h: values.clientReminder24h, clientReminder2h: values.clientReminder2h,
          trainerNewBooking: values.trainerNewBooking, trainerCancellation: values.trainerCancellation,
          adminDigest: values.adminDigest, adminDigestTime: values.adminDigestTime?.format('HH:mm') ?? state.value?.adminDigestTime ?? '20:00', adminRecipientIds: values.adminRecipientIds })
      }} onFinishFailed={({ errorFields }) => form.scrollToField(errorFields[0]?.name ?? [], { focus: true })}>
        <Form.Item name="clientReminder24h" valuePropName="checked">
          <ToggleSettingRow title="Напоминание клиенту за 24 часа" description="За сутки до начала тренировки.">
            <Typography.Text type="secondary">Получатель — клиент с привязанным VK. Отправка за 24 часа до занятия.</Typography.Text>
          </ToggleSettingRow>
        </Form.Item>
        <Form.Item name="clientReminder2h" valuePropName="checked">
          <ToggleSettingRow title="Напоминание клиенту за 2 часа" description="В день тренировки, за два часа до начала.">
            <Typography.Text type="secondary">Получатель — клиент с привязанным VK. Отправка за 2 часа до занятия.</Typography.Text>
          </ToggleSettingRow>
        </Form.Item>
        <Form.Item name="trainerNewBooking" valuePropName="checked">
          <ToggleSettingRow title="Новая запись тренеру" description="Сразу после создания записи на тренировку.">
            <Typography.Text type="secondary">Получатель — назначенный тренер с привязанным VK.</Typography.Text>
          </ToggleSettingRow>
        </Form.Item>
        <Form.Item name="trainerCancellation" valuePropName="checked">
          <ToggleSettingRow title="Отмена записи тренеру" description="Сразу после отмены тренировки.">
            <Typography.Text type="secondary">Получатель — назначенный тренер с привязанным VK.</Typography.Text>
          </ToggleSettingRow>
        </Form.Item>
        <ToggleSettingRow title="Ежедневная сводка администратору" description="Количество записей и отмен за текущий день."
          checked={digest ?? false} onChange={checked => form.setFieldValue('adminDigest', checked)}>
          <Form.Item name="adminDigestTime" label="Время отправки" rules={[{ required: true, message: 'Выберите время отправки' }]}>
            <TimePicker format="HH:mm" needConfirm={false} allowClear={false} />
          </Form.Item>
          <Form.Item name="adminRecipientIds" label="Получатели сводки" rules={[{ required: true, type: 'array', min: 1, message: 'Выберите хотя бы одного администратора' }]}>
            <Select mode="multiple" loading={recipients.loading} notFoundContent="Нет администраторов с привязанным Telegram" options={recipients.value?.map(user => ({ value: user.id, label: user.email }))}
              placeholder="Выберите администраторов" />
          </Form.Item>
          {recipients.error && <Alert type="error" showIcon message={recipients.error} action={<Button onClick={recipients.retry}>Повторить</Button>} />}
        </ToggleSettingRow>
        {canManage && <Button aria-label="Сохранить" style={{ marginTop: 24 }} type="primary" htmlType="submit" loading={state.saving}>Сохранить</Button>}
      </Form>
    </Spin></Card>
  </Space>
}
