import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Card, Collapse, DatePicker, Empty, Modal, Select, Space, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { DateTime } from 'luxon'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { usePermissions } from '../../modulePermissions'

type PayoutType = 'ADVANCE' | 'FINAL_SALARY'
type Lesson = { payScheme?: string; fixedPay?: string; commissionPercent?: number; id: string; startTime: string; serviceName: string; nominalPrice: string; trainerPayout: string }
type Statement = { commissionPercent?: number | string; id: string; type: PayoutType; status: 'DRAFT' | 'APPROVED' | 'PAID'; trainer?: { name: string; fullName: string } | null; staff?: { fullName: string } | null; periodStart: string; periodEnd: string;
  lessonsCount: number; nominalBase: string; accrued: string; advanceDeducted: string; totalAmount: string; lessonBreakdown: Lesson[] }
const money = (value: string) => `${Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} руб.`
const statuses = { DRAFT: 'Черновик', APPROVED: 'Утверждено', PAID: 'Выплачено' }
const trainerName = (row: Statement) => row.trainer?.name || row.trainer?.fullName || row.staff?.fullName || 'Требуется привязка тренера'

export function TrainerStatements() {
  const modules = usePermissions()
  const writable = modules.canWrite('STAFF_PAYROLL')
  const { message } = App.useApp()
  const [month, setMonth] = useState(() => DateTime.now().setZone('Europe/Moscow').toFormat('yyyy-MM'))
  const [type, setType] = useState<PayoutType>('ADVANCE')
  const [range, setRange] = useState<[string, string]>()
  const from = range?.[0] ?? `${month}-01`
  const to = range?.[1] ?? (type === 'ADVANCE' ? `${month}-15` : dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD'))
  const [rows, setRows] = useState<Statement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [version, refresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [confirmation, setConfirmation] = useState<{ row: Statement; pay: boolean }>()
  const [confirmationError, setConfirmationError] = useState<string>()
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => { if (!controller.signal.aborted) { setLoading(true); setError(undefined); setRows([]) } })
    void httpClient.get<Statement[]>(`${API_URL}/payroll/statements`, { params: { month }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setRows(data) })
      .catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [month, version])
  const run = async (operation: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(undefined)
    try { await operation(); refresh(value => value + 1); window.dispatchEvent(new Event('cash-desk-paid')); void message.success('Ведомость обновлена') }
    catch (cause) { setError(toHttpError(cause).message); throw cause }
    finally { lock.current = false; setBusy(false) }
  }
  const transition = (row: Statement, pay: boolean) => { setConfirmationError(undefined); setConfirmation({ row, pay }) }
  const confirm = async () => {
    if (!confirmation || lock.current) return
    setConfirmationError(undefined)
    try {
      await run(() => { if (!isUuid(confirmation.row.id)) throw new Error('Некорректный идентификатор ведомости'); return httpClient.patch(`${API_URL}/payroll/statements/${confirmation.row.id}/${confirmation.pay ? 'pay' : 'approve'}`) })
      setConfirmation(undefined)
    } catch (cause) { setConfirmationError(toHttpError(cause).message) }
  }
  return <><Card title="Зарплата и выплаты тренерам">
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary">Индивидуальная ставка тренера от номинальной цены услуги за проведённые занятия. Скидки клиента не уменьшают начисления. Из зарплаты вычитаются выплаченные авансы этого месяца.</Typography.Paragraph>
      {!writable && <Alert type="info" showIcon message="Доступно только для просмотра" />}
      <Space wrap>
        <Select virtual={false} aria-label="Тип ведомости" value={type} disabled={busy} style={{ minWidth: 150 }} onChange={value => { setType(value); setRange(undefined) }} options={[{ value: 'ADVANCE', label: 'Аванс' }, { value: 'FINAL_SALARY', label: 'Зарплата' }]} />
        <DatePicker aria-label="Месяц ведомости" picker="month" locale={ruDatePicker} value={dayjs(`${month}-01`)} allowClear={false} disabled={busy} onChange={value => { if (value) { setMonth(value.format('YYYY-MM')); setRange(undefined) } }} />
        <DatePicker.RangePicker aria-label="Период ведомости" locale={ruDatePicker} format="DD.MM.YYYY" allowClear={false} value={[dayjs(from), dayjs(to)]} disabled={busy || type === 'FINAL_SALARY'} onChange={values => { if (values?.[0] && values[1]) setRange([values[0].format('YYYY-MM-DD'), values[1].format('YYYY-MM-DD')]) }} />
        {writable && <Button type="primary" loading={busy} disabled={loading || busy} onClick={() => { void run(() => httpClient.post(`${API_URL}/payroll/statements/generate`, { month, type, periodStart: from, periodEnd: to })).catch(() => {}) }}>Сформировать ведомость</Button>}
        <Button disabled={busy || loading} onClick={() => refresh(value => value + 1)}>Обновить</Button>
      </Space>
      {error && <Alert role="alert" type="error" showIcon message={error} action={<Button onClick={() => refresh(value => value + 1)}>Повторить</Button>} />}
      <ResponsiveTable<Statement> rowKey="id" loading={loading} dataSource={rows.filter(row => row.type === type)} pagination={{ pageSize: 10 }}
        locale={{ emptyText: <Empty description="Ведомостей пока нет. Выберите период и сформируйте расчёт." /> }} columns={[
          { title: 'Тренер', render: (_, row) => <><strong>{trainerName(row)}</strong><div>{dayjs(row.periodStart.slice(0, 10)).format('DD.MM')}–{dayjs(row.periodEnd.slice(0, 10)).format('DD.MM.YYYY')}</div></> },
          { title: 'Ставка', render: (_, row) => <Space wrap>{[...new Set(row.lessonBreakdown.length ? row.lessonBreakdown.map(lesson => lesson.payScheme === 'FIXED' ? `${money(lesson.fixedPay ?? lesson.trainerPayout)} / занятие` : `${Number(lesson.commissionPercent ?? row.commissionPercent ?? 30)}%`) : [`${Number(row.commissionPercent ?? 30)}%`])].map(rate => <Tag key={rate} color="processing">{rate}</Tag>)}</Space> },
          { title: 'Занятия, шт.', dataIndex: 'lessonsCount' },
          ...(['nominalBase', 'accrued', 'advanceDeducted', 'totalAmount'] as const).map((key, index) => ({ key, title: ['База по номиналу, руб.', 'Начислено, руб.', 'Удержано аванса, руб.', 'К выплате, руб.'][index], render: (_: unknown, row: Statement) => <span className="tabular-nums">{money(row[key])}</span> })),
          { title: 'Статус', render: (_, row) => <Tag color={row.status === 'PAID' ? 'success' : row.status === 'APPROVED' ? 'processing' : 'default'}>{statuses[row.status]}</Tag> },
          { title: 'Занятия', render: (_, row) => <Collapse ghost size="small" items={[{ key: row.id, label: 'Детализация', children: <Space direction="vertical">{row.lessonBreakdown.map(lesson => <div key={lesson.id}>{DateTime.fromISO(lesson.startTime).setZone('Europe/Moscow').toFormat('dd.MM HH:mm')} · {lesson.serviceName}<br /><span className="tabular-nums">{lesson.payScheme === 'FIXED' ? 'Фикс за занятие' : `${money(lesson.nominalPrice)} × ${Number(lesson.commissionPercent ?? row.commissionPercent ?? 30)}%`} → {money(lesson.trainerPayout)}</span></div>)}</Space> }]} /> },
          { key: 'actions', title: 'Действия', render: (_, row) => writable && row.status !== 'PAID' && <Button disabled={busy || (row.status === 'APPROVED' && !modules.canWrite('CASHBOX'))} onClick={() => transition(row, row.status === 'APPROVED')}>{row.status === 'DRAFT' ? 'Утвердить' : 'Выплатить из основной кассы'}</Button> },
        ]} />
    </Space>
  </Card>
    <Modal open={!!confirmation} title={confirmation?.pay ? 'Выплатить из основной кассы?' : 'Утвердить ведомость?'}
      closable={!busy} maskClosable={!busy} keyboard={!busy} onCancel={() => setConfirmation(undefined)}
      afterOpenChange={open => { if (open) cancelRef.current?.focus() }} footer={<Space><Button ref={cancelRef} disabled={busy} onClick={() => setConfirmation(undefined)}>Отмена</Button><Button aria-label={confirmation?.pay ? 'Выплатить' : 'Утвердить'} type="primary" loading={busy} onClick={() => { void confirm() }}>{confirmation?.pay ? 'Выплатить' : 'Утвердить'}</Button></Space>}>
      {confirmation && <Typography.Paragraph>{trainerName(confirmation.row)}: {money(confirmation.row.totalAmount)}. {confirmation.pay ? 'Будет создан расход основной кассы. Повторная выплата исключена.' : 'Проверьте детализацию занятий перед утверждением.'}</Typography.Paragraph>}
      {confirmationError && <Alert role="alert" type="error" showIcon message={confirmationError} />}
    </Modal>
  </>
}
