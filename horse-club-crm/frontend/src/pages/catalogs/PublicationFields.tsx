import { Form, Input } from 'antd'
import { BooleanField, NumberField, TextField } from './shared'

export function PublicationFields() {
  return <>
    <BooleanField name="isPublic" label="Отображать на сайте" />
    <Form.Item name="imageUrl" label="Ссылка на фото" normalize={(value: string) => value.trim() || null}
      rules={[
        { type: 'url', message: 'Введите полную ссылку на фото (https://...)' },
        { pattern: /^https?:\/\//i, message: 'Используйте ссылку http:// или https://' },
        { max: 2048, message: 'Не более 2048 символов' },
      ]}>
      <Input aria-label="Ссылка на фото" maxLength={2048} placeholder="https://..." />
    </Form.Item>
    <TextField name="description" label="Описание для сайта" multiline max={5000} />
    <TextField name="role" label="Направление / роль на сайте" />
    <NumberField name="order" label="Порядок на сайте" max={2147483647} />
  </>
}
