import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Card, Col, DatePicker, Descriptions, Modal, Row, Select, Space, Spin, Typography } from 'antd'
import dayjs from 'dayjs'
import { DateTime } from 'luxon'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { usePermissions } from '../../modulePermissions'

type Closing = { isClosed: boolean; cashboxes: Array<{ cashbox: 'MAIN' | 'BOARDING'; opening: string; income: string; expense: string; closing: string; oneOff: string; memberships: string; other: string }>;
  memberships: { recognizedRevenue: string; remainingLessons: number; deferred: string }; warnings: string[]; pendingLessons: number }
const money = (value: string) => `${Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} руб.`

export function PeriodClosingButton() {
  const modules = usePermissions()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  if (!modules.canRead('CASHBOX')) return null
  return <><Button ref={triggerRef} onClick={() => setOpen(true)}>Закрытие смены / месяца</Button><PeriodClosingModal open={open} onClose={() => setOpen(false)} afterClose={() => triggerRef.current?.focus()} /></>
}

export function PeriodClosingModal({ open, onClose, afterClose }: { open: boolean; onClose: () => void; afterClose: () => void }) {
  const { canWrite } = usePermissions()
  const { modal, message } = App.useApp()
  const [type, setType] = useState<'SHIFT' | 'MONTH'>('SHIFT')
  const [date, setDate] = useState(() => DateTime.now().setZone('Europe/Moscow').minus({ days: 1 }).toISODate()!)
  const [data, setData] = useState<Closing>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [revision, refresh] = useState(0)
  const lock = useRef(false)
  const params = { type, ...(type === 'MONTH' ? { month: date.slice(0, 7) } : { date }) }
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void Promise.resolve().then(() => { if (!controller.signal.aborted) { setLoading(true); setError(undefined); setData(undefined) } })
    void httpClient.get<Closing>(`${API_URL}/finance/closing-preview`, { params: { type, ...(type === 'MONTH' ? { month: date.slice(0, 7) } : { date }) }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setData(response.data) })
      .catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, type, date, revision])
  const close = () => {
    const dialog = modal.confirm({ title: type === 'SHIFT' ? 'Закрыть выбранный день?' : 'Закрыть выбранный месяц?',
    content: 'Финансовые операции и начисления за этот период будут заблокированы для редактирования. Проверьте сверку обеих касс.',
    okText: 'Закрыть период', cancelText: 'Вернуться к сверке', autoFocusButton: 'cancel',
    onOk: async () => {
      if (lock.current) return
      lock.current = true; setBusy(true); setError(undefined)
      dialog.update({ cancelButtonProps: { disabled: true }, keyboard: false })
      try {
        const response = await httpClient.post<Closing>(`${API_URL}/finance/close-period`, params)
        setData(response.data); window.dispatchEvent(new Event('cash-desk-paid')); void message.success('Период закрыт')
      } catch (cause) { setError(toHttpError(cause).message); dialog.update({ content: <Alert role="alert" type="error" message={toHttpError(cause).message} /> }); throw cause }
      finally { lock.current = false; setBusy(false); dialog.update({ cancelButtonProps: { disabled: false }, keyboard: true }) }
    },
    })
  }
  return <Modal open={open} afterClose={afterClose} title="Закрытие смены / месяца" width={860} onCancel={onClose} closable={!busy} maskClosable={!busy} keyboard={!busy}
    styles={{ body: { maxHeight: '65dvh', overflowY: 'auto' } }} footer={<Space wrap><Button disabled={busy} onClick={onClose}>Отмена</Button>
      <Button type="primary" loading={busy} disabled={!canWrite('CASHBOX') || loading || busy || !data || data.isClosed || data.pendingLessons > 0} onClick={close}>Подтвердить закрытие периода</Button></Space>}>
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap><Select virtual={false} aria-label="Тип закрытия" value={type} disabled={busy} style={{ minWidth: 230 }} options={[{ value: 'SHIFT', label: 'Закрыть смену (день)' }, { value: 'MONTH', label: 'Закрыть месяц' }]} onChange={setType} />
        <DatePicker aria-label="Период закрытия" picker={type === 'MONTH' ? 'month' : 'date'} locale={ruDatePicker} format={type === 'MONTH' ? 'MM.YYYY' : 'DD.MM.YYYY'} allowClear={false} value={dayjs(date)} disabled={busy} onChange={value => value && setDate(value.format('YYYY-MM-DD'))} /></Space>
      <Typography.Text type="secondary">Время Москвы. Смена закрывает выбранный календарный день для всех кассиров.</Typography.Text>
      {error && <Alert type="error" role="alert" showIcon message={error} action={<Button disabled={busy} onClick={() => refresh(value => value + 1)}>Повторить</Button>} />}
      {loading && <Spin aria-label="Загрузка сверки касс" />}
      {data && <>
        {data.isClosed && <Alert type="success" showIcon message="Период закрыт. Редактирование заблокировано." />}
        <Row gutter={[12, 12]}>{data.cashboxes.map(box => <Col xs={24} md={12} key={box.cashbox}><Card size="small" title={box.cashbox === 'MAIN' ? 'Основная касса' : 'Касса постоя'}>
          <Descriptions column={1} size="small" className="tabular-nums" items={[
            { key: 'opening', label: 'Остаток на начало', children: money(box.opening) },
            { key: 'income', label: 'Приход', children: money(box.income) },
            { key: 'oneOff', label: 'Разовые услуги', children: money(box.oneOff) },
            { key: 'memberships', label: 'Абонементы', children: money(box.memberships) },
            { key: 'other', label: 'Прочие поступления', children: money(box.other) },
            { key: 'expense', label: 'Расход, включая выплаты', children: money(box.expense) },
            { key: 'closing', label: 'Остаток на конец', children: <strong>{money(box.closing)}</strong> },
          ]} />
        </Card></Col>)}</Row>
        <Card size="small" title="Переходящие абонементы"><Descriptions column={1} className="tabular-nums" items={[
          { key: 'revenue', label: 'Признанная выручка за период', children: money(data.memberships.recognizedRevenue) },
          { key: 'lessons', label: 'Предоплаченные занятия', children: `${data.memberships.remainingLessons} шт.` },
          { key: 'deferred', label: 'Переходящая предоплата', children: money(data.memberships.deferred) },
        ]} /></Card>
        {data.warnings.map(warning => <Alert key={warning} type="warning" showIcon message={warning} />)}
      </>}
    </Space>
  </Modal>
}
