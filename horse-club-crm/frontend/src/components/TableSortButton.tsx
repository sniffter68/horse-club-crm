import type { SortOrder } from 'antd/es/table/interface'

export function TableSortButton({ label, order, onClick }: {
  label: string
  order: SortOrder
  onClick: () => void
}) {
  const next = order === 'ascend' ? 'по убыванию' : order === 'descend' ? 'сбросить сортировку' : 'по возрастанию'
  return <button type="button" className={`table-sort-button${order ? ' table-sort-button--active' : ''}`}
    aria-label={`${label}: ${next}`} onClick={event => { event.stopPropagation(); onClick() }}>
    <span>{label}</span>
    <svg aria-hidden="true" width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
      <path d="M6 2 1 7h10Z" opacity={order === 'ascend' ? 1 : 0.3} />
      <path d="m6 14-5-5h10Z" opacity={order === 'descend' ? 1 : 0.3} />
    </svg>
  </button>
}
