import { useEffect, useRef, useState } from 'react'
import { useInvalidate } from '@refinedev/core'
import { Alert, Button, Select, Space, Tag, type SelectProps } from 'antd'
import type { RefSelectProps } from 'antd/es/select'
import { API_URL, httpClient, toHttpError } from '../httpClient'
import { isUuid } from '../uuid'
import { useCatalogPermissions } from '../pages/catalogs/permissions'
import { QuickCreateClientModal, type CreatedClient } from '../pages/clients/QuickCreateClientModal'

export function OneTimeBadge() { return <Tag className="crm-tag crm-tag--warning">Разовый</Tag> }
type Props = Omit<SelectProps<string>, 'options' | 'onChange'> & {
  onChange?: (value: string | undefined) => void
  onCreated?: (client: CreatedClient) => void
  excludedIds?: string[]
}
export function ClientSelectWithCreate({ value, onChange, onCreated, excludedIds = [], disabled, ...props }: Props) {
  const { canManage } = useCatalogPermissions()
  const invalidate = useInvalidate()
  const select = useRef<RefSelectProps>(null)
  const [rows, setRows] = useState<CreatedClient[]>([])
  const [resultSearch, setResultSearch] = useState('')
  const [cache, setCache] = useState(new Map<string, CreatedClient>())
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState<'REGULAR' | 'ONE_TIME'>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [revision, retry] = useState(0)
  const [composing, setComposing] = useState(false)
  useEffect(() => {
    if (composing) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true); setError(undefined)
      void httpClient.get<CreatedClient[]>(`${API_URL}/clients`, { params: { q: search, _start: 0, _end: 50 }, signal: controller.signal })
        .then(({ data }) => {
          if (controller.signal.aborted) return
          setCache(current => new Map([...current, ...data.map(row => [row.id, row] as const)])); setRows(data); setResultSearch(search)
        }).catch(cause => { if (!controller.signal.aborted) { setRows([]); setError(toHttpError(cause).message) } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, search ? 300 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [search, revision, composing])
  useEffect(() => {
    if (!value || cache.has(value) || !isUuid(value)) return
    const controller = new AbortController()
    void httpClient.get<CreatedClient>(`${API_URL}/clients/${value}`, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setCache(current => new Map(current).set(data.id, data))
    }).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [value, cache, revision])
  const choices = new Map((resultSearch === search ? rows : []).map(row => [row.id, row]))
  if (!search && value && cache.has(value)) choices.set(value, cache.get(value)!)
  const restoreFocus = () => { setCreating(undefined); requestAnimationFrame(() => select.current?.focus()) }
  return <div onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}>
    <Select<string> {...props} ref={select} value={value} disabled={disabled} showSearch allowClear filterOption={false}
      aria-label={props['aria-label'] ?? 'Клиент'} placeholder={props.placeholder ?? 'Имя или телефон'}
      open={!creating && open} onOpenChange={setOpen} searchValue={search} onSearch={query => { setLoading(true); setSearch(query) }} onClear={() => setSearch('')}
      onInputKeyDown={event => { if (event.key === 'Escape') event.stopPropagation() }}
      loading={loading} onChange={id => { setSearch(''); onChange?.(id) }}
      options={[...choices.values()].map(row => ({ value: row.id, disabled: row.id !== value && excludedIds.includes(row.id),
        label: <Space wrap>{row.name} · {row.phone || 'без телефона'}{row.clientType === 'ONE_TIME' && <OneTimeBadge />}</Space> }))}
      notFoundContent={loading ? 'Загрузка…' : 'Клиенты не найдены'}
      popupRender={menu => <>{menu}{error && <Alert role="alert" type="error" message={error} action={<Button onClick={() => retry(n => n + 1)}>Повторить</Button>} />}
        {search && <Button type="link" onClick={() => { setSearch(''); select.current?.focus() }}>Очистить поиск</Button>}
        {canManage && !disabled && <Space direction="vertical" style={{ padding: 8, width: '100%' }}>
          <Button block onClick={() => { setOpen(false); setCreating('REGULAR') }}>+ Постоянный клиент</Button>
          <Button block onClick={() => { setOpen(false); setCreating('ONE_TIME') }}>⚡ Разовый гость</Button>
        </Space>}
      </>} />
    {creating && <QuickCreateClientModal initialQuery={search} isOneTime={creating === 'ONE_TIME'} onCancel={restoreFocus} onCreated={client => {
      setCache(current => new Map(current).set(client.id, client)); setRows(current => [...current.filter(row => row.id !== client.id), client]); setSearch('')
      onChange?.(client.id); onCreated?.(client)
      void invalidate({ resource: 'clients', invalidates: ['list', 'many'] }); restoreFocus()
    }} />}
  </div>
}
