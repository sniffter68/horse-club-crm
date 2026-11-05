import { useState } from 'react'
import { Select, type SelectProps } from 'antd'
import { SearchHighlight } from './LiveSearch'
import { matchRange } from './searchText'

/** Local catalog selection keeps Ant Design's keyboard and disabled-option behavior. */
export function SearchSelect({ onSearch, ...props }: SelectProps<string>) {
  const [query, setQuery] = useState('')
  return <Select<string> {...props} showSearch allowClear
    onSearch={value => { setQuery(value); onSearch?.(value) }}
    onOpenChange={open => { if (!open) setQuery(''); props.onOpenChange?.(open) }}
    filterOption={(value, option) => !value || (typeof option?.label === 'string' && Boolean(matchRange(option.label, value)))}
    optionRender={option => typeof option.label === 'string' ? <SearchHighlight text={option.label} query={query} /> : option.label} />
}
