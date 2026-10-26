import { EditOutlined } from '@ant-design/icons'
import { usePermissions as useModules } from '../../modulePermissions'
import { useEffect, useRef, useState } from 'react'
import { usePermissions, useOnError } from '@refinedev/core'
import { Alert, App, Button, Card, DatePicker, Empty, Grid, Pagination, Select, Space, Spin, Tabs, Tag, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { DateTime } from 'luxon'
import { getIdentity, type Role } from '../../authStorage'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { currency } from '../cash-desk/shared'
import { AdjustmentModal, PayoutModal, ProfileModal, ShiftModal } from './forms'
import { staffRoles, shiftColors, shiftStatuses, type PageData, type Payroll, type Shift, type Staff } from './types'
import './staff.css'
import { isUuid } from '../../uuid'

const validDate = (value: string | null, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value).isValid ? value : fallback

export function StaffPage() {
  const { data: role, isLoading: roleLoading } = usePermissions<Role>({})
  const modules = useModules()
  const canManage = modules.canWrite('STAFF_PAYROLL') && (role === 'ADMIN' || role === 'MANAGER')
  const { modal, message } = App.useApp()
  const { mutate: authError } = useOnError()
  const screens = Grid.useBreakpoint()
  const [params, setParams] = useSearchParams()
  const now = DateTime.now().setZone('Europe/Moscow')
  const month = validDate(`${params.get('month') ?? now.toFormat('yyyy-MM')}-01`, now.startOf('month').toISODate()!)
  const from = validDate(params.get('from'), now.startOf('month').toISODate()!)
  const to = validDate(params.get('to'), now.endOf('month').toISODate()!)
  const rawTab = params.get('tab') ?? 'employees'
  const tab = ['employees', 'shifts', 'payroll', ...(canManage ? ['rates'] : [])].includes(rawTab) ? rawTab : 'shifts'
  const roleFilter = params.get('role') || undefined
  const activity = params.get('activity') || undefined
  const duty = params.get('duty') || undefined
  const rawPage = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const update = (values: Record<string, string>) => setParams(current => {
    const next = new URLSearchParams(current)
    Object.entries(values).forEach(([key, value]) => next.set(key, value))
    return next
  })
  const [staff, setStaff] = useState<Staff[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [payroll, setPayroll] = useState<Payroll[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [version, refresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [profileModal, setProfileModal] = useState<Staff | 'new'>()
  const [shiftModal, setShiftModal] = useState<Shift | 'new'>()
  const [adjustment, setAdjustment] = useState<Payroll>()
  const [payout, setPayout] = useState<Payroll>()
  useEffect(() => {
    if (roleLoading) return
    const controller = new AbortController()
    const load = async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return
      setLoading(true); setError(undefined)
      if (tab === 'payroll') {
        const response = await httpClient.get<PageData<Payroll>>(`${API_URL}/payroll/calculate`, { params: { from, to, page, pageSize: 10 }, signal: controller.signal })
        if (controller.signal.aborted) return
        setPayroll(response.data.data); setTotal(response.data.total)
        if (page > Math.max(1, Math.ceil(response.data.total / 10))) setParams(current => { const next = new URLSearchParams(current); next.set('page', '1'); return next })
      } else {
        const response = await httpClient.get<PageData<Staff>>(`${API_URL}/staff`, { params: { page, pageSize: 10, ...(tab === 'employees' ? { role: roleFilter, activity, duty } : {}) }, signal: controller.signal })
        if (controller.signal.aborted) return
        const people = response.data.data
        if (tab === 'shifts') {
          const end = DateTime.fromISO(month).endOf('month').toISODate()
          const results = await Promise.all(people.map(person => httpClient.get<PageData<Shift>>(`${API_URL}/staff/shifts`, { params: { staffId: person.id, from: month, to: end, pageSize: 100 }, signal: controller.signal })))
          if (controller.signal.aborted) return
          setShifts(results.flatMap(result => result.data.data))
        }
        setStaff(people); setTotal(response.data.total)
        if (page > Math.max(1, Math.ceil(response.data.total / 10))) setParams(current => { const next = new URLSearchParams(current); next.set('page', '1'); return next })
      }
    }
    void load().catch(cause => {
      if (controller.signal.aborted) return
      const failure = toHttpError(cause); setError(failure.message)
      if (failure.statusCode === 401) authError(failure)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [tab, roleFilter, activity, duty, page, from, to, month, version, roleLoading, role, authError, setParams])

  const changed = () => { setProfileModal(undefined); setShiftModal(undefined); setAdjustment(undefined); setPayout(undefined); refresh(value => value + 1) }
  const run = async (work: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(undefined)
    try { await work(); refresh(value => value + 1) }
    catch (cause) { const failure = toHttpError(cause); setError(failure.message); if (failure.statusCode === 401) authError(failure) }
    finally { lock.current = false; setBusy(false) }
  }
  const complete = (shift: Shift) => run(async () => { await httpClient.patch(`${API_URL}/staff/shifts/${shift.id}`, { status: 'COMPLETED' }); void message.success('Смена отмечена отработанной') })
  const remove = (shift: Shift) => modal.confirm({ title: 'Удалить смену?', content: `${staff.find(person => person.id === shift.staffId)?.fullName} · ${dayjs(shift.date.slice(0, 10)).format('DD.MM.YYYY')}. Смена будет удалена из табеля.`, okText: 'Удалить смену', cancelText: 'Отмена', okButtonProps: { danger: true }, autoFocusButton: 'cancel', onOk: async () => {
    try { await httpClient.delete(`${API_URL}/staff/shifts/${shift.id}`); changed(); void message.success('Смена удалена') }
    catch (cause) { const failure = toHttpError(cause); setError(failure.message); throw failure }
  } })
  const preparePayout = (row: Payroll) => run(async () => {
    const saved = await httpClient.post(`${API_URL}/payroll/calculations`, { staffId: row.staffId, from, to, bonuses: Number(row.bonuses), penalties: Number(row.penalties), expectedUpdatedAt: row.updatedAt ?? null })
    if (Number(saved.data.totalAmount) !== Number(row.totalAmount)) throw new Error('Начисления изменились. Нажмите «Обновить» и проверьте расчет перед выплатой')
    setPayout({ ...row, ...saved.data })
  })
  const shiftActions = (shift: Shift) => canManage && <Space wrap>
    {shift.status !== 'COMPLETED' && shift.date.slice(0, 10) <= now.toISODate()! && <Button size="small" disabled={busy} onClick={() => complete(shift)}>Отметить смену отработанной</Button>}
    <Button size="small" disabled={busy} onClick={() => setShiftModal(shift)}>Изменить смену</Button>
    {role === 'ADMIN' && <Button size="small" danger disabled={busy} onClick={() => remove(shift)}>Удалить смену</Button>}
  </Space>
  const periodPreset = (offset: number) => {
    const start = now.plus({ months: offset }).startOf('month')
    update({ from: start.toISODate()!, to: start.endOf('month').toISODate()!, page: '1' })
  }
  const dates = Array.from({ length: DateTime.fromISO(month).daysInMonth ?? 31 }, (_, index) => DateTime.fromISO(month).plus({ days: index }))
  if (roleLoading) return <div className="loading-page"><Spin aria-label="Загрузка прав" /></div>
  return <div className="staff-page">
    <Typography.Title level={2}>Персонал</Typography.Title>
    <Typography.Paragraph type="secondary">График работы, табель и зарплата · время Москвы</Typography.Paragraph>
    <Tabs activeKey={tab} onChange={key => update({ tab: key, page: '1' })} items={[{ key: 'employees', label: 'Сотрудники' }, { key: 'shifts', label: 'График смен' }, { key: 'payroll', label: 'Табель и расчет зарплаты' }, ...(canManage ? [{ key: 'rates', label: 'Настройки ставок' }] : [])]} />
    <Card>
      <Space wrap className="staff-toolbar">
        {tab === 'employees' && <>
          <Select aria-label="Фильтр роли" placeholder="Все роли" allowClear value={roleFilter} style={{ minWidth: 160 }} options={Object.entries(staffRoles).map(([value, label]) => ({ value, label }))} onChange={value => update({ role: value ?? '', page: '1' })} />
          <Select aria-label="Статус сотрудника" placeholder="Все сотрудники" allowClear value={activity} style={{ minWidth: 170 }} options={[{ value: 'active', label: 'Активные' }, { value: 'archived', label: 'Архив' }]} onChange={value => update({ activity: value ?? '', page: '1' })} />
          <Select aria-label="Статус присутствия" placeholder="Все смены" allowClear value={duty} style={{ minWidth: 160 }} options={[{ value: 'on', label: 'На смене' }, { value: 'off', label: 'Выходной' }]} onChange={value => update({ duty: value ?? '', page: '1' })} />
        </>}
        {tab === 'shifts' && <><Typography.Text>Месяц</Typography.Text><DatePicker aria-label="Месяц графика" picker="month" locale={ruDatePicker} allowClear={false} value={dayjs(month)} onChange={value => value && update({ month: value.format('YYYY-MM'), page: '1' })} />
          {canManage && <Button type="primary" disabled={!staff.some(person => person.isActive) || loading || busy} onClick={() => setShiftModal('new')}>Запланировать смену</Button>}</>}
        {tab === 'payroll' && <><DatePicker.RangePicker aria-label="Период расчета" locale={ruDatePicker} format="DD.MM.YYYY" allowClear={false} value={[dayjs(from), dayjs(to)]} onChange={values => values?.[0] && values[1] && update({ from: values[0].format('YYYY-MM-DD'), to: values[1].format('YYYY-MM-DD'), page: '1' })} />
          <Button onClick={() => periodPreset(0)}>Текущий месяц</Button><Button onClick={() => periodPreset(-1)}>Прошлый месяц</Button></>}
        {canManage && <Button type="primary" onClick={() => setProfileModal('new')}>+ Добавить сотрудника</Button>}
        <Button disabled={loading || busy} onClick={() => refresh(value => value + 1)}>{error ? 'Повторить' : 'Обновить'}</Button>
      </Space>
      {error && <Alert className="staff-feedback" showIcon type="error" message="Не удалось выполнить операцию" description={error} />}
      {loading ? <div className="stable-loading"><Spin aria-label="Загрузка персонала" /></div> : !total ? <Empty description={canManage ? 'Сотрудников пока нет. Нажмите «+ Добавить сотрудника».' : 'Профиль сотрудника пока не создан. Обратитесь к администратору.'} /> : <>
        {tab === 'shifts' && (screens.md ? <div className="staff-grid-scroll"><table className="staff-grid"><caption>График смен за {DateTime.fromISO(month).setLocale('ru').toFormat('LLLL yyyy')}</caption><thead><tr><th scope="col">Сотрудник</th>{dates.map(date => <th scope="col" key={date.day}>{date.day}<small>{date.setLocale('ru').toFormat('ccc')}</small></th>)}</tr></thead>
          <tbody>{staff.map(person => <tr key={person.id}><th scope="row" style={{ borderInlineStart: `4px solid ${person.scheduleColor || 'transparent'}` }}>{person.fullName}{canManage && <Button size="small" icon={<EditOutlined />} aria-label={`Редактировать: ${person.fullName}`} onClick={() => setProfileModal(person)} />}<small>{person.roleTitle}{!person.isActive && ' · Неактивен'}</small></th>{dates.map(date => {
            const shift = shifts.find(row => row.staffId === person.id && row.date.slice(0, 10) === date.toISODate())
            return <td key={date.day}>{shift ? <div>{canManage ? <Button className="staff-shift-button" size="small" disabled={busy} onClick={() => setShiftModal(shift)}><Tag color={shiftColors[shift.status]}>{shiftStatuses[shift.status]}<br />{shift.startTime}–{shift.endTime}</Tag></Button> : <Tag color={shiftColors[shift.status]}>{shiftStatuses[shift.status]}<br />{shift.startTime}–{shift.endTime}</Tag>}
              {canManage && shift.status === 'SCHEDULED' && date.toISODate()! <= now.toISODate()! && <Button size="small" disabled={busy} aria-label={`Отметить смену отработанной: ${person.fullName}, ${date.toFormat('dd.MM')}`} onClick={() => complete(shift)}>Отработана</Button>}</div> : <span aria-label="Нет смены">—</span>}</td>
          })}</tr>)}</tbody></table></div> : <ResponsiveTable<Shift> rowKey="id" dataSource={shifts} pagination={{ pageSize: 10 }} locale={{ emptyText: 'В этом месяце смен нет' }} columns={[
            { title: 'Сотрудник', render: (_, row) => staff.find(person => person.id === row.staffId)?.fullName }, { title: 'Дата', render: (_, row) => dayjs(row.date.slice(0, 10)).format('DD.MM.YYYY') }, { title: 'Время', render: (_, row) => `${row.startTime}–${row.endTime}` }, { title: 'Статус', render: (_, row) => <Tag color={shiftColors[row.status]}>{shiftStatuses[row.status]}</Tag> }, ...(canManage ? [{ key: 'actions', title: 'Действия', render: (_: unknown, row: Shift) => shiftActions(row) }] : []),
          ]} />)}
        {tab === 'employees' && <ResponsiveTable<Staff> rowKey="id" dataSource={staff} pagination={false} columns={[
          { title: 'ФИО', dataIndex: 'fullName' },
          { title: 'Роль', render: (_, row) => <Tag>{staffRoles[row.user?.role ?? 'OTHER']}</Tag> },
          { title: 'Должность', dataIndex: 'roleTitle' },
          { title: 'Телефон', render: (_, row) => row.phone || '—' },
          { title: 'VK', render: (_, row) => row.user?.vkId ? <a href={`https://vk.com/id${row.user.vkId}`} target="_blank" rel="noreferrer"><Tag color="blue">VK</Tag></a> : '—' },
          { title: 'Статус', render: (_, row) => <Tag color={!row.isActive ? undefined : row.shifts?.length ? 'green' : 'orange'}>{!row.isActive ? 'В архиве' : row.shifts?.length ? 'На смене' : 'Выходной'}</Tag> },
          { title: 'Действия', render: (_, row) => <Space wrap>
            {canManage && <Button onClick={() => setProfileModal(row)}>Редактировать</Button>}
            {modules.canWrite('STAFF_PAYROLL') && row.isActive && (role === 'ADMIN' || row.user?.email === getIdentity()?.email) && <Button disabled={busy} onClick={() => run(() => { if (!isUuid(row.id)) throw new Error('Некорректный идентификатор сотрудника'); return httpClient.post(`${API_URL}/shifts/${row.shifts?.length ? 'end' : 'start'}`, { staffId: row.id }) })}>{row.shifts?.length ? 'Закончить смену' : 'Начать смену'}</Button>}
            {canManage && row.isActive && <Button danger disabled={busy} onClick={() => modal.confirm({ title: `Архивировать: ${row.fullName}?`, content: 'Доступ в CRM будет отключен. История тренировок и начислений сохранится.', okText: 'Архивировать', cancelText: 'Отмена', autoFocusButton: 'cancel', okButtonProps: { danger: true }, onOk: async () => { if (!isUuid(row.id)) throw new Error('Некорректный идентификатор сотрудника'); await httpClient.post(`${API_URL}/staff/${row.id}/archive`); changed() } })}>Архивировать</Button>}
          </Space> },
        ]} />}
        {tab === 'payroll' && <ResponsiveTable<Payroll> rowKey="staffId" dataSource={payroll} scroll={{ x: 1400 }} pagination={false} columns={[
          { title: 'Сотрудник', dataIndex: 'fullName' }, { title: 'Должность', dataIndex: 'roleTitle' }, { title: 'Смен', dataIndex: 'shiftsCount' }, { title: 'Занятий', dataIndex: 'lessonsCount' },
          { title: 'За смены', render: (_, row) => currency(row.shiftsTotal) }, { title: 'За занятия', render: (_, row) => currency(row.lessonsTotal) }, { title: 'Премии', render: (_, row) => currency(row.bonuses) }, { title: 'Удержания', render: (_, row) => currency(row.penalties) }, { title: 'Итого', render: (_, row) => <strong>{currency(row.totalAmount)}</strong> },
          { title: 'Статус', render: (_, row) => <Tag color={row.isPaid ? 'green' : row.blocked ? 'orange' : undefined}>{row.isPaid ? 'Выплачено' : row.blocked ? 'Пересекается с выплатой' : 'К выплате'}</Tag> },
          ...(canManage ? [{ key: 'actions', title: 'Действия', render: (_: unknown, row: Payroll) => !row.isPaid && !row.blocked && <Space wrap><Button disabled={busy} onClick={() => setAdjustment(row)}>Премии / Штрафы</Button><Button type="primary" disabled={busy || Number(row.totalAmount) <= 0} onClick={() => preparePayout(row)}>Выплатить</Button></Space> }] : []),
        ]} />}
        {tab === 'rates' && <ResponsiveTable<Staff> rowKey="id" dataSource={staff} pagination={false} columns={[
          { title: 'ФИО', dataIndex: 'fullName' }, { title: 'Должность', dataIndex: 'roleTitle' }, { title: 'За смену', render: (_, row) => currency(row.shiftRate ?? 0) }, { title: 'Индивидуальное занятие', render: (_, row) => currency(row.lessonRate ?? 0) }, { title: 'Групповое занятие', render: (_, row) => row.groupLessonRate == null ? 'По индивидуальной ставке' : currency(row.groupLessonRate) }, { title: 'Процент', render: (_, row) => `${row.lessonPercentage ?? 0} %` }, { title: 'Статус', render: (_, row) => row.isActive ? 'Активен' : 'Неактивен' }, { key: 'actions', title: 'Действия', render: (_, row) => <Button icon={<EditOutlined />} onClick={() => setProfileModal(row)}>Редактировать</Button> },
        ]} />}
        <Pagination className="staff-pagination" current={page} pageSize={10} total={total} showSizeChanger={false} showTotal={count => `Сотрудников: ${count}`} onChange={next => update({ page: String(next) })} />
      </>}
    </Card>
    {profileModal && <ProfileModal staff={profileModal === 'new' ? undefined : profileModal} onClose={() => setProfileModal(undefined)} onSaved={changed} />}
    {shiftModal && <ShiftModal staff={staff} shift={shiftModal === 'new' ? undefined : shiftModal} selectedDate={month.slice(0, 7) === now.toFormat('yyyy-MM') ? now.toISODate()! : month} onClose={() => setShiftModal(undefined)} onSaved={changed} onDelete={role === 'ADMIN' ? remove : undefined} />}
    {adjustment && <AdjustmentModal row={adjustment} from={from} to={to} onClose={() => setAdjustment(undefined)} onSaved={changed} />}
    {payout && <PayoutModal row={payout} from={from} to={to} onClose={() => setPayout(undefined)} onSaved={changed} />}
  </div>
}
