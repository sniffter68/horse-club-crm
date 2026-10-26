import { LessonDrawer } from '../schedule/LessonDrawer'
import { useEffect, useState } from 'react'
import { Alert, Button, Form, Select, Spin } from 'antd'
import { CalendarOutlined, ClockCircleOutlined, HomeOutlined, MedicineBoxOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons'
import { DateTime } from 'luxon'
import { usePermissions } from '../../modulePermissions'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { EntryOverlay } from '../../components/EntryOverlay'
import { CashDeskPaymentModal } from '../cash-desk/CashDeskPaymentModal'
import { ExpenseModal } from '../cash-desk/expenses'
import { QuickPlacement } from '../boarding-contracts/quick'
import { VetEntry } from '../stable/vet'
import { ShiftModal } from '../staff/forms'
import type { Staff, Shift } from '../staff/types'

const stopPopupEscape = (event: { key: string; stopPropagation: () => void }) => { if (event.key === 'Escape') event.stopPropagation() }

function ShiftsDrawer({ shifts, onClose, onSaved }: { shifts: Shift[]; onClose: () => void; onSaved: () => void }) {
  const [staff, setStaff] = useState<Staff[]>()
  const [error, setError] = useState<string>()
  const [selected, select] = useState<Shift>()
  const [revision, retry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      const rows: Staff[] = []
      for (let page = 1; ; page++) {
        const { data } = await httpClient.get<{ data: Staff[]; total: number }>(`${API_URL}/staff`, { params: { page, pageSize: 100 }, signal: controller.signal })
        rows.push(...data.data)
        if (rows.length >= data.total || !data.data.length) break
      }
      if (!controller.signal.aborted) setStaff(rows)
    })().catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [revision])
  if (!staff) return <EntryOverlay variant="drawer" open title="Открыть / закрыть смену" onCancel={onClose} footer={null}>
    {error ? <Alert type="error" message={error} action={<Button onClick={() => { setError(undefined); retry(n => n + 1) }}>Повторить</Button>} /> : <Spin aria-label="Загрузка сотрудников" />}
  </EntryOverlay>
  return <ShiftModal key={selected?.id ?? 'new'} variant="drawer" staff={staff} shift={selected} selectedDate={DateTime.now().setZone('Europe/Moscow').toISODate()!} onClose={onClose} onSaved={onSaved}
    leading={<Form.Item label="Открыть новую или изменить смену"><Select onInputKeyDown={stopPopupEscape} aria-label="Выбрать смену" placeholder="Новая смена" allowClear value={selected?.id}
      options={shifts.map(row => ({ value: row.id, label: `${staff.find(person => person.id === row.staffId)?.fullName ?? row.staffId} · ${row.startTime}–${row.endTime}` }))} onChange={id => select(shifts.find(row => row.id === id))} /></Form.Item>} />

}

export function QuickActions({ onSaved, shifts }: { onSaved: () => void; shifts: Shift[] }) {
  const permissions = usePermissions()
  const [action, setAction] = useState<string>()
  const close = () => setAction(undefined)
  const saved = () => { close(); onSaved() }
  return <>
    <section aria-label="Быстрые действия" className="dashboard-quick-actions">
      {permissions.canWrite('SCHEDULE') && <Button type="primary" icon={<CalendarOutlined aria-hidden />} onClick={() => setAction('lesson')}>+ Записать на тренировку</Button>}
      {permissions.canWrite('CASHBOX') && <>
        <Button className="quick-action-success" icon={<PlusOutlined aria-hidden />} onClick={() => setAction('payment')}>+ Принять оплату</Button>
        <Button className="quick-action-warning" icon={<MinusOutlined aria-hidden />} onClick={() => setAction('expense')}>− Внести расход</Button>
      </>}
      {permissions.canWrite('STABLES') && <Button className="quick-action-info" icon={<HomeOutlined aria-hidden />} onClick={() => setAction('boarding')}>+ Заселить лошадь</Button>}
      {permissions.canWrite('VETERINARY') && <Button className="quick-action-vet" icon={<MedicineBoxOutlined aria-hidden />} onClick={() => setAction('vet')}>Ветпроцедура</Button>}
      {permissions.canWrite('STAFF_PAYROLL') && <Button icon={<ClockCircleOutlined aria-hidden />} onClick={() => setAction('shift')}>Открыть / закрыть смену</Button>}
    </section>
    {action === 'lesson' && permissions.canWrite('SCHEDULE') && <LessonDrawer onClose={close} onSaved={saved} />}
    {action === 'payment' && permissions.canWrite('CASHBOX') && <CashDeskPaymentModal variant="drawer" onClose={close} />}
    {action === 'expense' && permissions.canWrite('CASHBOX') && <ExpenseModal variant="drawer" onClose={close} />}
    {action === 'boarding' && permissions.canWrite('STABLES') && <QuickPlacement variant="drawer" context={{ kind: 'DASHBOARD', id: '', name: 'Клуб' }} onClose={close} onSaved={onSaved} />}
    {action === 'vet' && permissions.canWrite('VETERINARY') && <VetEntry variant="drawer" onClose={close} onSaved={saved} />}
    {action === 'shift' && permissions.canWrite('STAFF_PAYROLL') && <ShiftsDrawer shifts={shifts} onClose={close} onSaved={saved} />}
  </>
}
