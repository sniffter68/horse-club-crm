import type { ReactNode } from 'react'
import { Tooltip, type TableProps } from 'antd'
import { useTableColumns, type ConfigurableColumn } from '../hooks/useTableColumns'
import { ResponsiveTable } from './ResponsiveTable'
import { TableColumnSettings } from './TableColumnSettings'

export function TableCellText({ children }: { children: string | null | undefined }) {
  if (!children) return <>—</>
  return <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{children}</span>} trigger={['hover', 'focus']}>
    <span tabIndex={0} className="table-cell-text">{children}</span>
  </Tooltip>
}

export function ConfigurableTable<T extends object>({ columns, storageKey, defaultHiddenColumns = [], className, ...props }: Omit<TableProps<T>, 'columns'> & {
  columns: ConfigurableColumn<T>[]; storageKey: string; defaultHiddenColumns?: readonly string[]
}) {
  const table = useTableColumns(columns.map(column => ({ ...column, defaultVisible: column.defaultVisible ?? !defaultHiddenColumns.includes(String(column.key)) })), storageKey)
  const visible = table.columns.map(column => ({
    ...column,
    align: column.align ?? 'left' as const,
    render: (value: unknown, record: T, index: number): ReactNode => {
      const rendered: ReactNode = column.render ? column.render(value, record, index) as ReactNode : value as ReactNode
      return typeof rendered === 'string' ? <TableCellText>{rendered}</TableCellText> : rendered ?? '—'
    },
  }))
  const width = visible.reduce((total, column) => total + (typeof column.width === 'number' ? column.width : 120), 0)
  return <>
    <div className="catalog-table-toolbar"><TableColumnSettings settings={table.settings} definitions={table.available} /></div>
    <ResponsiveTable<T> {...props} size="small" tableLayout="fixed" columns={visible}
      className={['crm-entity-table', className].filter(Boolean).join(' ')} scroll={{ ...props.scroll, x: width }} />
  </>
}
