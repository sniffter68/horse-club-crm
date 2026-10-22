import { DatePicker, theme, type DatePickerProps } from 'antd'
import { useMemo, type CSSProperties } from 'react'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/ru'
import dayjsGenerateConfig from 'rc-picker/es/generate/dayjs'
import { toLocalInput } from '../pages/schedule/time'

// Form values are club wall times; “Сейчас” must use the same zone as submission.
const ClubDatePicker = DatePicker.generatePicker<Dayjs>({
  ...dayjsGenerateConfig,
  getNow: () => dayjs(toLocalInput(new Date())),
})
const locale = { ...ruDatePicker, lang: { ...ruDatePicker.lang, ok: 'ОК', now: 'Сейчас' } }

export function BookingDateTimePicker(props: DatePickerProps) {
  const { token } = theme.useToken()
  return <ClubDatePicker {...props} locale={locale} needConfirm showNow
    showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm"
    popupAlign={{ overflow: { adjustX: true, adjustY: true, shiftY: true } }}
    classNames={{ popup: { root: 'triad-date-popup booking-date-popup' } }}
    styles={{ popup: { root: { '--booking-picker-bg': token.colorBgElevated, '--booking-picker-text': token.colorText } as CSSProperties } }}
    style={{ width: '100%', ...props.style }}
    onKeyDown={(event, ...args) => {
      if (event.key === 'Escape') event.stopPropagation()
      props.onKeyDown?.(event, ...args)
    }} />
}

export function BookingDateTimeInput({ value, onChange, ...props }: Omit<DatePickerProps, 'value' | 'onChange'> & {
  value?: string; onChange?: (value?: string) => void;
}) {
  // Keep the committed Dayjs reference stable while availability/validation rerenders.
  // A new reference would reset Ant Design's unconfirmed calendar selection.
  const date = useMemo(() => value ? dayjs(value) : null, [value])
  return <BookingDateTimePicker {...props} value={date}
    onChange={next => onChange?.(next?.format('YYYY-MM-DDTHH:mm'))} />
}
