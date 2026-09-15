import { isValidElement, type Key, type ReactNode } from 'react'
import { Card, Grid, List, Table, Typography, type TableProps } from 'antd'
import type { ColumnType } from 'antd/es/table'
import type { PaginationConfig } from 'antd/es/pagination'

type DataIndex = string | number | readonly (string | number)[]

function readValue(record: object, dataIndex?: DataIndex): unknown {
  if (dataIndex === undefined) return undefined
  const path = Array.isArray(dataIndex) ? dataIndex : [dataIndex]
  return path.reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return undefined
    return (value as Record<string | number, unknown>)[key]
  }, record)
}

function displayValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return '—'
  if (isValidElement(value) || typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  return String(value)
}

function columnLabel<T extends object>(column: ColumnType<T>): ReactNode {
  if (typeof column.title !== 'function') return column.title
  return typeof column.key === 'string' || typeof column.key === 'number' ? String(column.key) : ''
}

export function ResponsiveTable<T extends object>({ columns = [], ...tableProps }: TableProps<T>) {
  const screens = Grid.useBreakpoint()
  if (screens.md) return <Table<T> {...tableProps} columns={columns} />

  const pagination: false | PaginationConfig | undefined = tableProps.pagination && typeof tableProps.pagination === 'object'
    ? {
        current: tableProps.pagination.current,
        pageSize: tableProps.pagination.pageSize,
        total: tableProps.pagination.total,
        onChange: tableProps.pagination.onChange,
        hideOnSinglePage: tableProps.pagination.hideOnSinglePage,
        disabled: tableProps.pagination.disabled,
        simple: true,
        showSizeChanger: false,
      }
    : tableProps.pagination
  const emptyText = typeof tableProps.locale?.emptyText === 'function'
    ? tableProps.locale.emptyText()
    : tableProps.locale?.emptyText
  const mobileColumns = columns
    .filter(column => !column.hidden)
    .map(column => column as ColumnType<T>)

  return <List<T>
    className="responsive-record-list"
    dataSource={tableProps.dataSource ? [...tableProps.dataSource] : []}
    loading={tableProps.loading}
    pagination={pagination}
    locale={{ emptyText: emptyText ?? 'Нет данных' }}
    renderItem={(record, index) => {
      const rowKey = tableProps.rowKey
      const key = typeof rowKey === 'function'
        ? rowKey(record)
        : rowKey !== undefined
          ? readValue(record, rowKey as DataIndex) as Key
          : index
      return <List.Item key={key} className="responsive-record-item">
        <Card size="small">
          {mobileColumns.map((column, columnIndex) => {
            const value = readValue(record, column.dataIndex as DataIndex | undefined)
            const rendered = column.render?.(value, record, index) as ReactNode | undefined
            const cellKey = column.key ?? (Array.isArray(column.dataIndex) ? column.dataIndex.join('.') : column.dataIndex) ?? columnIndex
            const isActions = column.key === 'actions'
            return <div key={String(cellKey)} className={`responsive-record-field${isActions ? ' responsive-record-field--actions' : ''}`}>
              {!isActions && <Typography.Text type="secondary" className="responsive-record-label">{columnLabel(column)}</Typography.Text>}
              <div className="responsive-record-value">{displayValue(rendered ?? value)}</div>
            </div>
          })}
        </Card>
      </List.Item>
    }}
  />
}
