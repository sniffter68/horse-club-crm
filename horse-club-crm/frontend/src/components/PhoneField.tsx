import { Form, Input } from 'antd'

import { formatPhone } from './formatPhone'

export function PhoneField({ required = false, initialValue }: { required?: boolean; initialValue?: string | null }) {
  return <Form.Item name="phone" label="Телефон" initialValue={initialValue} normalize={formatPhone} getValueProps={value => ({ value: formatPhone(value ?? '') })} rules={[
    { required, message: 'Введите телефон' },
    { validator: (_, value: string) => !value || /^\+?\d[\d\s()-]*$/.test(value) && value.replace(/\D/g, '').length >= 10
      ? Promise.resolve() : Promise.reject(new Error('Введите полный номер телефона')) },
  ]}><Input type="tel" autoComplete="tel" aria-label="Телефон" placeholder="+7 (999) 123-45-67" maxLength={40} /></Form.Item>
}
