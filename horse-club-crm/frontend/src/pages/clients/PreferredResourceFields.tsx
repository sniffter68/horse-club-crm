import { useEffect, useState } from 'react'
import { Alert, Button, Form, Select } from 'antd'
import { catalog } from '../catalogs/loadCatalog'
import type { Client, Horse, Trainer } from '../catalogs/types'
import { toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { activePreferredHorse, activePreferredTrainer } from './preferredResources'

export function PreferredResourceFields() {
  const form = Form.useFormInstance()
  const [data, setData] = useState<{ horses: Horse[]; trainers: Trainer[] }>({ horses: [], trainers: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [revision, retry] = useState(0)
  const trainerId = Form.useWatch('preferredTrainerId', form)
  const horseId = Form.useWatch('preferredHorseId', form)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([catalog<Trainer>('trainers', controller.signal), catalog<Horse>('horses', controller.signal)])
      .then(([trainers, horses]) => { if (!controller.signal.aborted) setData({ trainers, horses }) })
      .catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  const rule = { validator: async (_: unknown, value?: string | null) => { if (value && !isUuid(value)) throw new Error('Выберите значение из списка') } }
  const options = (rows: { id: string; name: string }[], selected: string | undefined, relation: Client['preferredHorse']) => {
    const result: { value: string; label: string; disabled?: boolean }[] = rows.map(row => ({ value: row.id, label: row.name }))
    if (selected && !result.some(row => row.value === selected)) result.push({ value: selected, label: `${relation?.name || selected} · недоступен`, disabled: true })
    return result
  }
  return <>
    {error && <Alert type="error" showIcon message="Не удалось загрузить тренеров и лошадей" description={error} action={<Button onClick={() => { setLoading(true); setError(undefined); retry(value => value + 1) }}>Повторить</Button>} />}
    <Form.Item name="preferredTrainerId" label="Тренер по умолчанию" getValueFromEvent={value => value || null} rules={[rule]}>
      <Select allowClear showSearch optionFilterProp="label" placeholder="Не назначен" loading={loading} disabled={loading || Boolean(error)}
        options={[{ value: '', label: 'Не назначен' }, ...options(data.trainers.filter(activePreferredTrainer), trainerId, form.getFieldValue('preferredTrainer'))]} />
    </Form.Item>
    <Form.Item name="preferredHorseId" label="Лошадь по умолчанию" getValueFromEvent={value => value || null} rules={[rule]}>
      <Select allowClear showSearch optionFilterProp="label" placeholder="Не назначена" loading={loading} disabled={loading || Boolean(error)}
        options={[{ value: '', label: 'Не назначена' }, ...options(data.horses.filter(activePreferredHorse), horseId, form.getFieldValue('preferredHorse'))]} />
    </Form.Item>
  </>
}
