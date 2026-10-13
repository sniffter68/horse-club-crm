import { ImageUploadField } from '../../components/ImageUploadField'
import { BooleanField, NumberField, TextField } from './shared'

export function PublicationFields() {
  return <>
    <BooleanField name="isPublic" label="Отображать на сайте" />
    <ImageUploadField />
    <TextField name="description" label="Описание для сайта" multiline max={5000} />
    <TextField name="role" label="Направление / роль на сайте" />
    <NumberField name="order" label="Порядок на сайте" max={2147483647} />
  </>
}
