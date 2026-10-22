import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, App, Button, Card, Empty, Form, Input, Modal, Select, Space, Spin, Statistic, Tag, Tooltip, Typography } from 'antd'
import { PrinterOutlined, WarningOutlined } from '@ant-design/icons'
import { useOnError } from '@refinedev/core'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { useCatalogPermissions } from '../catalogs/permissions'
import { StableEntryModal } from '../stable/shared'
import { horseStatuses } from '../stable/types'
import { StallSign } from './sign'
import { sexes, statuses, zones, type MapHorse, type MapStall } from './mapTypes'
import './map.css'

const colors = { AVAILABLE: 'green', OCCUPIED: 'default', MAINTENANCE: 'orange', QUARANTINE: 'red' }

export function StallMap() {
  const [stalls, setStalls] = useState<MapStall[]>([])
  const [horses, setHorses] = useState<MapHorse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [selectedId, setSelectedId] = useState<string>()
  const [printId, setPrintId] = useState<string>()
  const { canManage } = useCatalogPermissions('stalls')
  const { mutate: onError } = useOnError()
  const [params, setParams] = useSearchParams()
  const zone = params.get('zone') ?? 'ALL'
  const request = useRef(0)
  const opener = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (!selectedId) opener.current?.focus() }, [selectedId])
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const generation = ++request.current
    setLoading(true); setError(undefined)
    try {
      const [map, horseList] = await Promise.all([
        httpClient.get<MapStall[]>(`${API_URL}/stalls/map`, { signal }),
        canManage ? httpClient.get<MapHorse[]>(`${API_URL}/stalls/assignment-horses`, { signal }) : Promise.resolve({ data: [] as MapHorse[] }),
      ])
      if (generation === request.current) { setStalls(map.data); setHorses(horseList.data) }
    } catch (cause) {
      if (signal?.aborted || generation !== request.current) return
      const failure = toHttpError(cause); setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    } finally { if (!signal?.aborted && generation === request.current) setLoading(false) }
  }, [onError, canManage])
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => { if (!controller.signal.aborted) void refresh(controller.signal) })
    return () => { controller.abort() }
  }, [refresh])
  const visible = stalls.filter(stall => zone === 'ALL' || stall.zone === zone)
  const occupied = visible.filter(stall => stall.horse)
  const selected = stalls.find(stall => stall.id === selectedId)
  const printed = stalls.find(stall => stall.id === printId)
  const saved = () => { setSelectedId(undefined); void refresh() }
  const riskReasons = (stall: MapStall) => [...new Set([
    ...(stall.warnings ?? []).map(warning => warning.message),
    ...(stall.zone === 'QUARANTINE' || stall.status === 'QUARANTINE' ? ['Карантинная зона'] : []),
  ])]
  const tile = (stall?: MapStall) => stall ? <Tooltip key={stall.id} trigger={['hover', 'focus']} title={riskReasons(stall).length ? <>{riskReasons(stall).map(reason => <div key={reason}>{reason}</div>)}</> : null}>
    <button type="button" className={`stall-tile stall-tile--${stall.status.toLowerCase()}`}
    key={stall.id} onClick={event => { opener.current = event.currentTarget; setSelectedId(stall.id) }} aria-label={`Денник ${stall.number ?? stall.name}, ${stall.horse?.name ?? statuses[stall.status]}`}>
    <span className="stall-tile-heading"><strong>№ {stall.number ?? stall.name}</strong><Tag color={colors[stall.status]}>{statuses[stall.status]}</Tag></span>
    <span className="stall-horse-name">{stall.horse?.name ?? '—'}</span>
    {stall.horse && <><span>{stall.horse.sex ? sexes[stall.horse.sex] : 'Пол не указан'} · {stall.horse.ownerType === 'private' ? 'Частный постой' : 'Клубная'}</span>
      <span>{horseStatuses[stall.horse.status as keyof typeof horseStatuses] ?? stall.horse.status}</span></>}
    {!!riskReasons(stall).length && <span className="stall-warning"><WarningOutlined /> Риск соседства</span>}
  </button></Tooltip> : <div aria-hidden="true" />
  return <section className="stall-map">
    <Space wrap className="stall-map-toolbar"><Typography.Title level={2}>Карта денников</Typography.Title>
      <Link to="/stalls">Список денников</Link><Button onClick={() => void refresh()} disabled={loading}>Обновить</Button>
      <Select aria-label="Корпус" value={zone} onChange={value => setParams(value === 'ALL' ? {} : { zone: value })}
        options={[{ value: 'ALL', label: 'Все корпуса' }, ...Object.entries(zones).map(([value, label]) => ({ value, label }))]} />
    </Space>
    {error && <Alert type="error" showIcon message="Не удалось загрузить карту" description={error} action={<Button onClick={() => void refresh()}>Повторить</Button>} />}
    {loading ? <div className="stable-loading"><Spin aria-label="Загрузка карты денников" /></div> : !error && <>
      <div className="stall-stats">
        <Card><Statistic title="Всего денников" value={visible.length} /></Card>
        <Card><Statistic title="Занято" value={occupied.length} /><span>Клубные: {occupied.filter(s => s.horse?.ownerType === 'club').length} · Частные: {occupied.filter(s => s.horse?.ownerType === 'private').length}</span></Card>
        <Card><Statistic title="Свободно" value={visible.filter(s => s.status === 'AVAILABLE').length} /></Card>
        <Card><Statistic title="Ремонт / карантин" value={visible.filter(s => ['MAINTENANCE', 'QUARANTINE'].includes(s.status)).length} /></Card>
      </div>
      {!visible.length && <Empty description="Денников в этом корпусе пока нет" />}
      {Object.entries(zones).map(([key, label]) => {
        const building = visible.filter(s => s.zone === key)
        if (!building.length) return null
        const positions = [...new Set(building.flatMap(s => s.position === null ? [] : [s.position]))].sort((a, b) => a - b)
        return <section key={key} aria-label={label}><Typography.Title level={3}>{label}</Typography.Title>
          <div className="stall-aisle-header"><span>Левый ряд</span><span>Проход</span><span>Правый ряд</span></div>
          <div className="stall-aisle">{positions.map(position => <div className="stall-aisle-row" key={position}>
            {tile(building.find(s => s.position === position && s.side === 'LEFT'))}<div className="stall-passage" aria-hidden="true">{position}</div>
            {tile(building.find(s => s.position === position && s.side === 'RIGHT'))}</div>)}</div>
          {building.some(s => s.position === null) && <><Typography.Title level={4}>Расположение не указано</Typography.Title>
            <p>Укажите сторону и позицию в редакторе денника, чтобы включить проверку соседства.</p>
            <div className="stall-unplaced">{building.filter(s => s.position === null).map(s => tile(s))}</div></>}
        </section>
      })}
    </>}
    {selected && <StallDetails key={selected.id} stall={selected} horses={horses} stalls={stalls} canManage={canManage}
      onClose={() => setSelectedId(undefined)} onSaved={saved} onPrint={() => setPrintId(selected.id)} />}
    {printed && <StallSign stall={printed} onClose={() => setPrintId(undefined)} />}
  </section>
}

function StallDetails({ stall, horses, stalls, canManage, onClose, onSaved, onPrint }: {
  stall: MapStall; horses: MapHorse[]; stalls: MapStall[]; canManage: boolean;
  onClose: () => void; onSaved: () => void; onPrint: () => void;
}) {
  const [form] = Form.useForm<{ status: MapStall['status']; notes: string }>()
  const [horseId, setHorseId] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const lock = useRef(false)
  const { message } = App.useApp()
  const { mutate: onError } = useOnError()
  useEffect(() => { if (canManage) form.setFields([{ name: 'status', value: stall.status, touched: false }, { name: 'notes', value: stall.notes ?? '', touched: false }]) }, [canManage, form, stall])
  const draftStatus = Form.useWatch('status', form)
  const draftNotes = Form.useWatch('notes', form)
  const dirty = (draftStatus !== undefined && draftStatus !== stall.status) || (draftNotes !== undefined && draftNotes !== (stall.notes ?? ''))
  const assign = async (id: string | null) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(undefined)
    try { await httpClient.patch(`${API_URL}/stalls/${stall.id}/assign`, { horseId: id }); onSaved(); void message.success('Размещение сохранено') }
    catch (cause) { const failure = toHttpError(cause); setError(failure.message); if (failure.statusCode === 401) onError(failure) }
    finally { lock.current = false; setBusy(false) }
  }
  const content = <>
    <Typography.Paragraph>{stall.horse?.name ?? 'Лошадь не назначена'} · {statuses[stall.status]}</Typography.Paragraph>
    {stall.warnings?.map(w => <Alert key={w.neighborId} type="warning" showIcon message={w.message} description={`Денник ${w.neighborNumber}`} />)}
    {stall.horse && !stall.horse.sex && <Alert type="info" message="Укажите пол лошади в её карточке для проверки соседства." />}
    <Button icon={<PrinterOutlined />} onClick={onPrint}>Печать таблички на денник</Button>
    {canManage && <div className="stall-assignment">
      {stall.horse ? <Button disabled={dirty} loading={busy} onClick={() => void assign(null)}>Убрать лошадь из денника</Button> : <>
        <label htmlFor="stall-horse">Лошадь для заселения</label>
        <Select id="stall-horse" aria-label="Лошадь для заселения" value={horseId} onChange={setHorseId} allowClear disabled={busy || stall.status !== 'AVAILABLE'}
          options={horses.map(h => { const current = stalls.find(s => s.horseId === h.id); return { value: h.id, label: `${h.name}${current ? ` · переселить из ${current.number ?? current.name}` : ' · без денника'}` } })} />
        <Button loading={busy} disabled={!horseId || stall.status !== 'AVAILABLE' || dirty} onClick={() => horseId && void assign(horseId)}>Заселить лошадь</Button>
      </>}
      <Typography.Paragraph type="secondary">Сначала сохраните изменения статуса и заметок. Переселение освобождает прежний денник; договор постоя сохраняется.</Typography.Paragraph>
      {error && <Alert type="error" showIcon message="Размещение не сохранено" description={error} />}
    </div>}
    {canManage ? <>
      <Form.Item name="status" label="Статус денника"><Select options={Object.entries(statuses).filter(([key]) => stall.horse ? key === 'OCCUPIED' : key !== 'OCCUPIED').map(([value, label]) => ({ value, label }))} /></Form.Item>
      <Form.Item name="notes" label="Заметки для конюха" rules={[{ max: 5000, message: 'Не более 5000 символов' }]}><Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} maxLength={5000} /></Form.Item>
    </> : <p className="stall-sign-notes">{stall.notes || 'Нет заметок'}</p>}
    {stall.horse?.feedingNotes && <><Typography.Title level={5}>Рацион кормления</Typography.Title><p className="stall-sign-notes">{stall.horse.feedingNotes}</p></>}
  </>
  if (!canManage) return <Modal open title={`Денник № ${stall.number ?? stall.name}`} onCancel={onClose} footer={<Button onClick={onClose}>Закрыть</Button>}>{content}</Modal>
  return <StableEntryModal title={`Денник № ${stall.number ?? stall.name}`} form={form} submitLabel="Сохранить денник"
    onClose={() => !lock.current && onClose()} onSaved={onSaved}
    save={values => { if (lock.current) return Promise.reject(new Error('Дождитесь завершения заселения')); return httpClient.patch(`${API_URL}/stalls/${stall.id}`, values) }}>
    {content}
  </StableEntryModal>
}
