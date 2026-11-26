import { List, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { plannedDayLabel, weekHours, type WeekDay } from './weekTemplates'

export function WeekPreview({ days }: { days: WeekDay[] }) {
  return <section aria-label="Предпросмотр недели" aria-live="polite">
    <Typography.Paragraph>Будут заменены дни ниже · Всего за неделю: {weekHours(days)} ч</Typography.Paragraph>
    <List size="small" dataSource={days} renderItem={day => <List.Item><span>{dayjs(day.date).format('DD.MM.YYYY')}</span><Tag color={day.kind === 'WORK' ? 'blue' : 'default'}>{plannedDayLabel(day)}</Tag></List.Item>} />
  </section>
}
