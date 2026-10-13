import { useContext, useEffect, useRef, useState } from 'react'
import { Button, Form, Image, Input, Space, Typography } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { API_URL, httpClient, toHttpError } from '../httpClient'
import { CatalogFormActivity } from '../pages/catalogs/CatalogFormActivity'
import { optimizeCatalogImage } from '../imageOptimization'

const uploadedPath = /^\/uploads\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/
const externalUrl = /^https?:\/\//i

function imagePreviewUrl(value: string): string {
  if (!uploadedPath.test(value)) return externalUrl.test(value) ? value : ''
  return /^https?:\/\//i.test(API_URL) ? new URL(value, API_URL).href : value
}

export function ImageUploadField() {
  const form = Form.useFormInstance()
  const value = Form.useWatch('imageUrl', form) as string | null | undefined
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [failedPreview, setFailedPreview] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)
  const setFormBusy = useContext(CatalogFormActivity)
  useEffect(() => () => { request.current?.abort(); request.current = null; setFormBusy(false) }, [setFormBusy])

  async function upload(file: File) {
    if (request.current) return
    setError(''); setStatus('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Выберите изображение JPG, PNG или WebP'); return
    }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      setError('Выберите непустой файл размером до 5 МБ'); return
    }
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setFormBusy(true)
    try {
      const optimized = await optimizeCatalogImage(file, controller.signal)
      const data = new FormData()
      data.append('file', optimized)
      const response = await httpClient.post<{ url: string }>(`${API_URL}/upload/image`, data, { signal: controller.signal })
      if (controller.signal.aborted) return
      form.setFieldValue('imageUrl', response.data.url)
      setStatus(`Фото «${file.name}» загружено. Сохраните карточку.`)
    } catch (failure) {
      if (!controller.signal.aborted) setError(toHttpError(failure).message)
    } finally {
      if (request.current === controller) {
        request.current = null
        setBusy(false); setFormBusy(false)
      }
    }
  }

  const preview = imagePreviewUrl(value || '')
  const brokenPreview = !!preview && failedPreview === preview
  return <>
    <Form.Item name="imageUrl" label="Ссылка на фото" normalize={(input: string) => input.trim() || null}
      rules={[
        { type: 'url', transform: (input: string) => uploadedPath.test(input) ? 'https://uploaded.example/photo.jpg' : input,
          message: 'Введите полную ссылку на фото (https://...)' },
        { validator: async (_, input: unknown) => {
          if (request.current) throw new Error('Дождитесь загрузки фото')
          if (input && (typeof input !== 'string' || (!uploadedPath.test(input) && !externalUrl.test(input)))) {
            throw new Error('Введите ссылку http:// или https:// либо загрузите фото')
          }
        } },
        { max: 2048, message: 'Не более 2048 символов' },
      ]}>
      <Input aria-label="Ссылка на фото" disabled={busy} maxLength={2048} placeholder="https://... или загрузите фото" />
    </Form.Item>
    <Space direction="vertical" style={{ width: '100%', marginBottom: 24 }}>
      <Space wrap>
        <input ref={picker} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Выбрать фото"
          disabled={busy} onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void upload(file)
          }} />
        <Button aria-label="Загрузить фото" icon={<UploadOutlined />} loading={busy} disabled={busy} onClick={() => picker.current?.click()}>Загрузить фото</Button>
        {busy && <Button onClick={() => { request.current?.abort(); setStatus('Загрузка отменена') }}>Отменить загрузку</Button>}
        <Typography.Text type="secondary">JPG, PNG, WebP · до 5 МБ</Typography.Text>
      </Space>
      <div aria-live="polite" style={{ minHeight: 22 }}>
        {error ? <Typography.Text type="danger" role="alert">{error}</Typography.Text> : busy ? 'Загрузка фото…' : status}
      </div>
      <div style={{ height: 180, maxWidth: 320, width: '100%' }}>
        {preview && !brokenPreview ? <Image src={preview} alt="Предпросмотр фото" width="100%" height={180}
          preview={false} style={{ objectFit: 'contain' }} onError={() => setFailedPreview(preview)} />
          : <Typography.Text type="secondary">{brokenPreview ? 'Не удалось показать фото. Проверьте ссылку.' : 'Фото не выбрано'}</Typography.Text>}
      </div>
    </Space>
  </>
}
