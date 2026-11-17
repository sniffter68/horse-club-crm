import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, App, Button, Empty, Form, Input, InputNumber, Modal, Select, Space, Switch, Tabs, Typography } from 'antd'
import { ClubIcon } from '../../components/ClubIcon'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { useSearchParams } from 'react-router-dom'
import { StableEntryModal } from '../stable/shared'
import type { MapStall } from './mapTypes'

import { fits, type StableBuilding, type Placement } from './gridLayout'

export function BuildingMap({ buildings, stalls, canManage, tile, onSaved, onEditingChange }: {
  buildings: StableBuilding[]; stalls: MapStall[]; canManage: boolean; tile: (stall: MapStall) => ReactNode; onSaved: () => void; onEditingChange: (editing: boolean) => void
}) {
  const [params, setParams] = useSearchParams()
  const requestedBuilding = params.get('buildingId')
  const active = buildings.some(b => b.id === requestedBuilding) ? requestedBuilding! : 'ALL'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Placement[]>([])
  const [settings, setSettings] = useState(false)
  const [buildingForm, setBuildingForm] = useState<StableBuilding | 'new'>()
  const [slot, setSlot] = useState<{ buildingId: string; row: number; col: number }>()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [dragged, setDragged] = useState<string>()
  const lock = useRef(false)
  const { modal, message } = App.useApp()
  const placements = stalls.filter(s => s.buildingId).map(s => ({ id: s.id, buildingId: s.buildingId!, row: s.row ?? 1, col: s.col ?? 1, rowSpan: s.rowSpan ?? 1, colSpan: s.colSpan ?? 1 }))
  const layout = editing ? draft : placements
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(placements)
  useEffect(() => { onEditingChange(editing); return () => onEditingChange(false) }, [editing, onEditingChange])
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || event.ctrlKey || event.metaKey) return
      event.preventDefault(); event.stopPropagation()
      modal.confirm({ title: 'Уйти без сохранения схемы?', content: 'Изменения расположения будут потеряны.', okText: 'Уйти', cancelText: 'Остаться', autoFocusButton: 'cancel', onOk: () => { window.location.assign(anchor.href) } })
    }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true) }
  }, [dirty, modal])
  const stop = () => {
    if (dirty) modal.confirm({ title: 'Отменить изменения схемы?', okText: 'Отменить изменения', cancelText: 'Продолжить', autoFocusButton: 'cancel', onOk: () => { setEditing(false); setFailure(undefined) } })
    else setEditing(false)
  }
  const change = (block: Placement, values: Partial<Placement>) => {
    if (busy) return
    const next = { ...block, ...values }; const building = buildings.find(b => b.id === next.buildingId)
    if (!building || !fits(next, building, draft)) { setFailure('Недостаточно места: выберите свободные ячейки внутри корпуса.'); return }
    setFailure(undefined); setDraft(items => items.map(item => item.id === next.id ? next : item))
  }
  const save = async () => {
    if (lock.current || !canManage) return
    lock.current = true; setBusy(true); setFailure(undefined)
    try {
      if (draft.some(b => !isUuid(b.id) || !isUuid(b.buildingId))) throw new Error('Обновите карту: некорректный идентификатор помещения')
      await httpClient.patch(`${API_URL}/stalls/layout`, draft)
      setEditing(false); void message.success('Схема сохранена'); onSaved()
    } catch (cause) { setFailure(toHttpError(cause).message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <>
    <Space wrap className="stall-map-toolbar">
      {canManage && <><Button disabled={editing} onClick={() => setSettings(true)}>Настроить корпуса</Button>
        <label><Switch aria-label="Режим конструктора" checked={editing} disabled={busy} onChange={checked => { if (checked) { setDraft(placements); setEditing(true) } else stop() }} /> Режим конструктора</label></>}
      {editing && <><Button type="primary" aria-label="Сохранить схему" aria-busy={busy} loading={busy} disabled={!dirty || busy} onClick={() => void save()}>Сохранить схему</Button><Button disabled={busy} onClick={stop}>Отмена</Button></>}
    </Space>
    {failure && <Alert type="error" showIcon message="Схема не сохранена" description={failure} />}
    <Tabs activeKey={active} onChange={id => setParams(current => { if (id === 'ALL') current.delete('buildingId'); else current.set('buildingId', id); return current })} items={[{ key: 'ALL', icon: <ClubIcon name="stable" />, label: 'Все корпуса' }, ...buildings.map(b => ({ key: b.id, icon: <ClubIcon name="stable" />, label: `${b.name} · ${b.occupied}/${b.total}` }))]} />
    {!buildings.length && <Empty description="Корпусов пока нет. Создайте корпус, чтобы разместить денники." />}
    {buildings.filter(b => active === 'ALL' || b.id === active).map(building => <section key={building.id} aria-label={building.name}>
      <Typography.Title level={3}>{building.name}</Typography.Title>
      <div className="stall-grid-scroll" tabIndex={0} aria-label={`Схема: ${building.name}`}><div className="stall-grid" style={{ gridTemplateRows: `repeat(${building.gridRows}, minmax(96px, auto))`, gridTemplateColumns: `repeat(${building.gridCols}, minmax(0, 1fr))`, minWidth: building.gridCols * (editing ? 210 : 150) }}>
        {Array.from({ length: building.gridRows * building.gridCols }, (_, index) => {
          const row = Math.floor(index / building.gridCols) + 1, col = index % building.gridCols + 1
          const occupied = layout.some(b => b.buildingId === building.id && row >= b.row && row < b.row + b.rowSpan && col >= b.col && col < b.col + b.colSpan)
          if (occupied) return null
          const aisle = building.aisleCols.includes(col)
          return editing ? <button type="button" key={`${row}:${col}`} className={`stall-grid-slot ${aisle ? 'stall-passage' : ''}`} disabled={busy}
            style={{ gridRow: row, gridColumn: col }} aria-label={`Поместить сюда: ряд ${row}, колонка ${col}, ${building.name}`}
            onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const block = draft.find(b => b.id === dragged); if (block) change(block, { buildingId: building.id, row, col }); setDragged(undefined) }}
            onClick={() => setSlot({ buildingId: building.id, row, col })}>+ Поместить сюда<span>Ряд {row} · колонка {col}{aisle ? ' · проход' : ''}</span></button>
            : <div key={`${row}:${col}`} className={aisle ? 'stall-passage' : 'stall-grid-empty'} style={{ gridRow: row, gridColumn: col }} aria-hidden="true">{aisle && `Проход · ${row}`}</div>
        })}
        {layout.filter(b => b.buildingId === building.id).map(block => {
          const stall = stalls.find(s => s.id === block.id)!
          return <div key={block.id} className="stall-grid-block" style={{ gridRow: `${block.row} / span ${block.rowSpan}`, gridColumn: `${block.col} / span ${block.colSpan}` }} draggable={editing && !busy} onDragStart={() => setDragged(block.id)} onDragEnd={() => setDragged(undefined)}>
            {tile(stall)}
            {editing && <div className="stall-grid-controls" aria-label={`Расположение ${stall.number || stall.name}`}>
              <Space wrap size={4}>{([[-1, 0, 'Вверх'], [1, 0, 'Вниз'], [0, -1, 'Влево'], [0, 1, 'Вправо']] as const).map(([r, c, label]) => <Button size="small" key={label} disabled={busy || !fits({ ...block, row: block.row + r, col: block.col + c }, building, draft)} onClick={() => change(block, { row: block.row + r, col: block.col + c })}>{label}</Button>)}</Space>
              <label>Высота <Select aria-label={`Высота ${stall.number || stall.name}`} value={block.rowSpan} disabled={busy} onChange={rowSpan => change(block, { rowSpan })} options={[1, 2, 3].map(value => ({ value, label: `${value}×`, disabled: !fits({ ...block, rowSpan: value }, building, draft) }))} /></label>
              <label>Ширина <Select aria-label={`Ширина ${stall.number || stall.name}`} value={block.colSpan} disabled={busy} onChange={colSpan => change(block, { colSpan })} options={[1, 2].map(value => ({ value, label: `${value}×`, disabled: !fits({ ...block, colSpan: value }, building, draft) }))} /></label>
            </div>}
          </div>
        })}
      </div></div>
    </section>)}
    {stalls.some(s => !s.buildingId) && <><Typography.Title level={3}>Без корпуса</Typography.Title><div className="stall-unplaced">{stalls.filter(s => !s.buildingId).map(s => <div key={s.id}>{tile(s)}{editing && <Button onClick={() => setSlot({ buildingId: buildings[0]?.id ?? '', row: 1, col: 1 })}>Разместить в корпусе</Button>}</div>)}</div></>}
    {slot && <PlaceInSlot slot={slot} stalls={stalls} busy={busy} dirty={dirty} onClose={() => setSlot(undefined)} onPlace={id => {
      const block = draft.find(b => b.id === id) ?? { id, ...slot, rowSpan: 1, colSpan: 1 }
      const next = { ...block, ...slot }, building = buildings.find(b => b.id === slot.buildingId)
      if (!building || !fits(next, building, draft)) { setFailure('Помещение не помещается в выбранные ячейки'); setSlot(undefined); return }
      setDraft(items => [...items.filter(b => b.id !== id), next]); setSlot(undefined); setFailure(undefined)
    }} onCreate={() => { setSlot(undefined); setEditing(false); onSaved() }} />}
    {settings && !buildingForm && <BuildingSettings buildings={buildings} onEdit={setBuildingForm} onClose={() => setSettings(false)} onSaved={onSaved} />}
    {buildingForm && <BuildingForm key={typeof buildingForm === 'string' ? buildingForm : buildingForm.id} building={buildingForm} onClose={() => setBuildingForm(undefined)} onSaved={() => { setBuildingForm(undefined); onSaved() }} />}
  </>
}

function PlaceInSlot({ slot, stalls, busy, dirty, onPlace, onClose, onCreate }: { slot: { buildingId: string; row: number; col: number }; stalls: MapStall[]; busy: boolean; dirty: boolean; onPlace: (id: string) => void; onClose: () => void; onCreate: () => void }) {
  const [form] = Form.useForm<{ existing?: string; type: 'STALL' | 'PONY_PEN' | 'SERVICE'; number?: string; name?: string }>()
  const existing = Form.useWatch('existing', form), type = Form.useWatch('type', form)
  return <StableEntryModal variant="drawer" title={`Помещение: ряд ${slot.row}, колонка ${slot.col}`} form={form} initialValues={{ type: 'STALL' }} submitLabel={existing ? 'Разместить помещение' : 'Создать помещение'} submitDisabled={busy || (dirty && !existing)} onClose={onClose} onSaved={() => { if (existing) onClose(); else onCreate() }} resources={['stalls']} save={async values => {
    if (values.existing) { onPlace(values.existing); return }
    if (!isUuid(slot.buildingId)) throw new Error('Выберите корпус')
    await httpClient.post(`${API_URL}/stalls`, { ...slot, type: values.type, number: values.type === 'SERVICE' ? '' : values.number, name: values.name, rowSpan: 1, colSpan: 1 })
  }}>
    <Form.Item name="existing" label="Переместить существующее помещение"><Select allowClear options={stalls.map(s => ({ value: s.id, label: s.number ? `№ ${s.number} ${s.name ?? ''}` : s.name ?? 'Помещение' }))} /></Form.Item>
    {!existing && <><Form.Item name="type" label="Тип помещения" rules={[{ required: true }]}><Select aria-label="Тип помещения" options={[{ value: 'STALL', label: 'Денник' }, { value: 'PONY_PEN', label: 'Загон для пони' }, { value: 'SERVICE', label: 'Служебное помещение' }]} /></Form.Item>
      {type !== 'SERVICE' && <Form.Item name="number" label="Номер" rules={[{ required: true, whitespace: true, message: 'Укажите номер' }, { max: 30 }]}><Input maxLength={30} /></Form.Item>}
      <Form.Item name="name" label="Название" rules={[{ required: type === 'SERVICE', whitespace: true, message: 'Укажите название' }, { max: 150 }]}><Input aria-label="Название" maxLength={150} /></Form.Item></>}
    <Alert type="info" message={existing ? 'Перемещение применится после нажатия «Сохранить схему».' : 'Новое помещение создаётся сразу. Сначала сохраните изменения схемы.'} />
  </StableEntryModal>
}

function BuildingSettings({ buildings, onEdit, onClose, onSaved }: { buildings: StableBuilding[]; onEdit: (b: StableBuilding | 'new') => void; onClose: () => void; onSaved: () => void }) {
  const { modal, message } = App.useApp()
  const [failure, setFailure] = useState<string>()
  return <Modal open title="Настроить корпуса" onCancel={onClose} footer={<Button onClick={onClose}>Закрыть</Button>}><Button onClick={() => onEdit('new')}>Создать корпус</Button>
    {failure && <Alert type="error" message={failure} />}
    {buildings.map(b => <Space wrap key={b.id} className="stall-building-settings"><strong>{b.name}</strong><span>{b.gridRows} × {b.gridCols} · помещений: {b.roomCount}</span><Button onClick={() => onEdit(b)}>Изменить {b.name}</Button>
      <Button danger disabled={b.roomCount > 0} onClick={() => modal.confirm({ title: `Удалить корпус «${b.name}»?`, okText: 'Удалить', cancelText: 'Отмена', autoFocusButton: 'cancel', okButtonProps: { danger: true }, onOk: async () => {
        try { if (!isUuid(b.id)) throw new Error('Некорректный корпус'); await httpClient.delete(`${API_URL}/stable-buildings/${b.id}`); onSaved(); void message.success('Корпус удалён') }
        catch (cause) { setFailure(toHttpError(cause).message); throw cause }
      } })}>Удалить {b.name}</Button></Space>)}
  </Modal>
}

function BuildingForm({ building, onClose, onSaved }: { building: StableBuilding | 'new'; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<{ name: string; gridRows: number; gridCols: number; aisleCols: number[]; order: number }>()
  const cols = Form.useWatch('gridCols', form) ?? 4
  return <StableEntryModal variant="drawer" title={building === 'new' ? 'Новый корпус' : 'Настройка корпуса'} form={form} initialValues={building === 'new' ? { gridRows: 10, gridCols: 4, aisleCols: [2, 3], order: 0 } : { ...building }} onClose={onClose} onSaved={onSaved} submitLabel="Сохранить корпус" resources={['stalls']} save={async values => {
    if (building !== 'new' && !isUuid(building.id)) throw new Error('Некорректный корпус')
    return building === 'new' ? httpClient.post(`${API_URL}/stable-buildings`, values) : httpClient.patch(`${API_URL}/stable-buildings/${building.id}`, values)
  }}>
    <Form.Item name="name" label="Название корпуса" rules={[{ required: true, whitespace: true, message: 'Укажите название корпуса' }, { max: 150 }]}><Input aria-label="Название корпуса" maxLength={150} /></Form.Item>
    <Form.Item name="gridRows" label="Количество рядов" rules={[{ required: true, type: 'integer', min: 1, max: 100 }]}><InputNumber min={1} max={100} /></Form.Item>
    <Form.Item name="gridCols" label="Количество колонок" rules={[{ required: true, type: 'integer', min: 1, max: 100 }]}><InputNumber min={1} max={100} /></Form.Item>
    <Form.Item name="aisleCols" label="Колонки прохода" rules={[{ validator: async (_, value: number[]) => { if (value?.some(n => n > cols)) throw new Error('Уберите колонки за границами корпуса') } }]}><Select mode="multiple" options={Array.from({ length: Math.min(100, cols) }, (_, i) => ({ value: i + 1, label: `Колонка ${i + 1}` }))} /></Form.Item>
    <Form.Item name="order" label="Порядок отображения" rules={[{ required: true, type: 'integer' }]}><InputNumber /></Form.Item>
  </StableEntryModal>
}
