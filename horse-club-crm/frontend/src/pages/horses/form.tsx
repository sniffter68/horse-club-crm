import { PublicationFields } from '../catalogs/PublicationFields'
import { CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Horse, HorseValues } from '../catalogs/types'
import { useParams } from 'react-router-dom'
import { HorseIssues } from '../schedule/HorseIssues'
import { Form, InputNumber, Select } from 'antd'
import { sexes } from '../stalls/mapTypes'
import { ClientSelectWithCreate } from '../../components/ClientSelectWithCreate'
import { horseStatuses } from '../stable/types'
import { isUuid } from '../../uuid'

export function HorseForm({ action }: { action: 'create' | 'edit' }) {
  const { id } = useParams()
  return <CatalogForm<Horse, HorseValues> resource="horses" action={action}
    title={action === 'create' ? 'Новая лошадь' : 'Редактирование лошади'}
    defaults={{ isPublic: true, order: 0, maxRiderWeight: 85, maxDailyMinutes: 240, minRestMinutes: 15, status: 'active', isUnavailable: false, ownerType: 'club' }}
    toPayload={({ isUnavailable, ...values }) => ({ ...values, isUnavailable: values.status ? values.status !== 'active' : isUnavailable, ownerId: values.ownerType === 'club' ? null : values.ownerId })}>
    <NumberField name="maxRiderWeight" label="Максимальный вес всадника, кг" min={1} max={1000} />
    <TextField name="name" label="Кличка" required />
    <Form.Item name="sex" label="Пол" normalize={value => value ?? null}><Select allowClear options={Object.entries(sexes).map(([value, label]) => ({ value, label }))} /></Form.Item>
    <Form.Item name="birthYear" label="Год рождения" normalize={value => value ?? null} rules={[{ type: 'integer', min: 1900, max: 2100, message: 'Укажите год от 1900 до 2100' }]}><InputNumber min={1900} max={2100} precision={0} /></Form.Item>
    <TextField name="breed" label="Порода" />
    <TextField name="coat" label="Масть" />
    <Form.Item name="status" label="Статус"><Select aria-label="Статус" options={Object.entries(horseStatuses).map(([value, label]) => ({ value, label }))} /></Form.Item>
    <Form.Item name="ownerType" label="Тип"><Select aria-label="Тип" options={[{ value: 'club', label: 'Клубная' }, { value: 'private', label: 'Постой' }]} /></Form.Item>
    <Form.Item noStyle shouldUpdate={(prev, next) => prev.ownerType !== next.ownerType}>{({ getFieldValue }) => getFieldValue('ownerType') === 'private' &&
      <Form.Item name="ownerId" label="Владелец" rules={[{ required: true, message: 'Выберите владельца' }, { validator: (_, value) => !value || isUuid(value) ? Promise.resolve() : Promise.reject(new Error('Выберите владельца из списка')) }]}><ClientSelectWithCreate aria-label="Владелец" /></Form.Item>}
    </Form.Item>
    <TextField name="riderLevel" label="Уровень всадника" max={100} />
    <TextField name="feedingNotes" label="Режим кормления" max={5000} multiline />
    <NumberField name="maxDailyMinutes" label="Суточный лимит нагрузки, мин" min={1} />
    <NumberField name="minRestMinutes" label="Минимальный отдых, мин" />
    {action === 'edit' && id && <HorseIssues horseId={id} readOnly />}
    <PublicationFields />
  </CatalogForm>
}
