import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AutoComplete, Button, Input, Typography, type InputRef } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { matchRange, type SearchSuggestion } from './searchText'

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const range = matchRange(text, query)
  return range ? <>{text.slice(0, range[0])}<mark>{text.slice(...range)}</mark>{text.slice(range[1])}</> : <>{text}</>
}

interface Props {
  value?: string
  onChange?: (value: string) => void
  onSearch: (value: string) => void
  suggestions?: readonly SearchSuggestion[]
  onSelectSuggestion?: (id: string) => void
  loading?: boolean
  placeholder?: string
  id?: string
  style?: CSSProperties
  'aria-label'?: string
}

export function LiveSearch({ value = '', onChange, onSearch, suggestions = [], onSelectSuggestion, loading, placeholder = 'Поиск', style, id, 'aria-label': ariaLabel = 'Поиск' }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const composing = useRef(false)
  const input = useRef<InputRef>(null)
  const clearButton = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState(false)
  const cancel = () => { clearTimeout(timer.current); timer.current = undefined }
  useEffect(() => () => clearTimeout(timer.current), [])
  const commit = (query: string) => { cancel(); setPending(false); onSearch(query) }
  const schedule = (query: string) => {
    cancel()
    setPending(Boolean(query))
    if (!query) commit('')
    else if (!composing.current) timer.current = setTimeout(() => commit(query), 300)
  }
  // Schedule after controlled Form value propagation, preserving typing focus.
  const latestValue = useRef(value)
  const search = useRef(onSearch)
  useEffect(() => { search.current = onSearch }, [onSearch])
  useEffect(() => {
    cancel()
    if (latestValue.current === value) return
    latestValue.current = value
    if (composing.current) return
    if (!value) { search.current(''); return }
    timer.current = setTimeout(() => { setPending(false); search.current(value) }, 300)
    return cancel
  }, [value])
  const options = pending || loading || !value.trim() ? [] : suggestions.slice(0, 8).map(item => ({
    value: item.id,
    label: <div><SearchHighlight text={item.text} query={value} />{item.detail && <><br /><Typography.Text type="secondary"><SearchHighlight text={item.detail} query={value} /></Typography.Text></>}</div>,
  }))
  return <AutoComplete style={{ width: '100%', ...style }} value={value} options={options} filterOption={false}
    onInputKeyDown={event => {
      if (event.key === 'Tab' && !event.shiftKey && value) {
        event.preventDefault(); event.stopPropagation(); requestAnimationFrame(() => clearButton.current?.focus())
      }
    }}
    onChange={(query, option) => {
      if (!option || !('label' in option)) { cancel(); setPending(Boolean(query)); onChange?.(query) }
    }}
    onSelect={id => {
      const item = suggestions.find(row => row.id === id)
      if (!item) return
      cancel(); latestValue.current = item.text; onChange?.(item.text); commit(item.text); onSelectSuggestion?.(id)
    }} notFoundContent={pending || loading ? 'Поиск…' : 'Совпадений нет'}>
    <Input ref={input} id={id} aria-label={ariaLabel} placeholder={placeholder} prefix={<SearchOutlined />}
      suffix={value ? <Button ref={clearButton} type="text" size="small" aria-label="Очистить поиск" onKeyDown={event => event.stopPropagation()} onClick={() => {
        composing.current = false; latestValue.current = ''; onChange?.(''); commit(''); input.current?.focus()
      }}>×</Button> : <span />}
      onCompositionStart={() => { composing.current = true; cancel() }}
      onCompositionEnd={event => { composing.current = false; schedule(event.currentTarget.value) }}
      onPressEnter={event => { event.preventDefault(); if (!composing.current && !event.nativeEvent.isComposing) commit(value) }} />
  </AutoComplete>
}
