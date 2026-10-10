import { TextField } from '../catalogs/shared'

export function ClientIdentityFields() {
  return <>
    <TextField name="firstName" label="Имя" required max={75} />
    <TextField name="lastName" label="Фамилия" max={74} />
    <TextField name="phone" label="Телефон" required max={40} />
  </>
}
