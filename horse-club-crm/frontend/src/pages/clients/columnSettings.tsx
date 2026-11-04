import { TableColumnSettings } from '../../components/TableColumnSettings'
import { optionalColumns, type useClientColumns } from './useClientColumns'

export function ClientColumnSettings({ settings, canManage }: {
  settings: ReturnType<typeof useClientColumns>; canManage: boolean
}) {
  return <TableColumnSettings settings={settings}
    definitions={optionalColumns.filter(column => canManage || !['membership', 'vk'].includes(column.key))}
    description="Клиент и телефон закреплены слева, действия — справа." />
}
