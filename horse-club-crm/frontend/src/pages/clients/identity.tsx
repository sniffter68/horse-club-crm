import { TextField } from '../catalogs/shared'
import { Form } from 'antd'
import { PhoneField } from '../../components/PhoneField'

export function ClientIdentityFields() {
  const clientType = Form.useWatch('clientType', { preserve: true })
  return <>
    <TextField name="firstName" label="Имя" required max={75} />
    <TextField name="lastName" label="Фамилия" max={74} />
    <PhoneField required={clientType !== 'ONE_TIME'} />
  </>
}
