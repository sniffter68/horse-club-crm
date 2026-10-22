import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Modal, Select, Space, Spin, Typography } from 'antd'
import { useOnError } from '@refinedev/core'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isHorseUuid } from '../stable/horseId'
import { zones, type MapStall } from './mapTypes'

type Preview = Array<{ stallId: string; number: string; warnings: MapStall['warnings'] }>

export function StallTransfer({ open, source, stalls, onClose, onSaved }: {
  open: boolean; source: MapStall; stalls: MapStall[]; onClose: () => void; onSaved: () => void;
}) {
  const [targetId, setTargetId] = useState<string>()
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const lock = useRef(false)
  const { message } = App.useApp()
  const { mutate: onError } = useOnError()
  const candidates = stalls.filter(stall => stall.id !== source.id && !stall.isUnavailable &&
    ['AVAILABLE', 'OCCUPIED'].includes(stall.status)).sort((a, b) => Number(Boolean(a.horse)) - Number(Boolean(b.horse)) ||
      (a.number ?? a.name).localeCompare(b.number ?? b.name, 'ru', { numeric: true }))
  const target = candidates.find(stall => stall.id === targetId)
  const valid = [source.id, source.horseId, targetId].every(isHorseUuid)
  useEffect(() => {
    if (!open || !targetId || !valid) return
    const controller = new AbortController()
    void httpClient.post<Preview>(`${API_URL}/stalls/transfer/preview`, {
      sourceStallId: source.id, targetStallId: targetId, horseId: source.horseId, swapIfOccupied: true,
      expectedTargetHorseId: stalls.find(stall => stall.id === targetId)?.horseId,
    }, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setPreview(result.data)
    }).catch(cause => {
      if (controller.signal.aborted) return
      const failure = toHttpError(cause); setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    })
    return () => controller.abort()
  }, [open, targetId, source.id, source.horseId, valid, onError, stalls, retry])
  const submit = async () => {
    if (lock.current || !valid || !target || !preview) return
    lock.current = true; setBusy(true); setError(undefined)
    try {
      await httpClient.post(`${API_URL}/stalls/transfer`, {
        sourceStallId: source.id, targetStallId: target.id, horseId: source.horseId, swapIfOccupied: Boolean(target.horse),
        expectedTargetHorseId: target.horseId,
      })
      void message.success(target.horse ? 'Лошади поменялись денниками' : 'Лошадь переведена в денник')
      onSaved()
    } catch (cause) {
      const failure = toHttpError(cause); setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    } finally { lock.current = false; setBusy(false) }
  }
  const warnings = preview?.flatMap(stall => stall.warnings.map(warning => `Денник ${stall.number}: ${warning.message}`)) ?? []
  return <Modal open={open} title="Перевести в денник" okText="Подтвердить" cancelText="Отмена" confirmLoading={busy}
    afterClose={() => { setTargetId(undefined); setPreview(undefined); setError(undefined) }}
    okButtonProps={{ disabled: !valid || !preview || !target || busy }} cancelButtonProps={{ disabled: busy }}
    maskClosable={!busy} keyboard={!busy} closable={!busy} onCancel={() => !lock.current && onClose()} onOk={() => void submit()}>
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Paragraph>{source.horse?.name} · из денника № {source.number ?? source.name}</Typography.Paragraph>
      <label htmlFor="transfer-target">Целевой денник</label>
      <Select id="transfer-target" aria-label="Целевой денник" style={{ width: '100%' }} value={targetId} disabled={busy}
        placeholder="Выберите денник" notFoundContent="Нет доступных денников"
        onChange={id => { setTargetId(id); setPreview(undefined); setError(undefined) }}
        options={candidates.map(stall => ({ value: stall.id, label: `${zones[stall.zone]} · № ${stall.number ?? stall.name} · ${stall.horse ? `Рокировка с ${stall.horse.name}` : 'Свободен'}` }))} />
      {targetId && !valid && <Alert type="error" message="Некорректный идентификатор. Обновите карту." />}
      {targetId && valid && !preview && !error && <Spin aria-label="Проверка соседства" />}
      {target?.horse && <Alert type="info" message={`${target.horse.name} перейдёт в денник № ${source.number ?? source.name}`} />}
      {warnings.length > 0 && <Alert type="warning" showIcon message="Риск соседства после перемещения" description={warnings.map(text => <div key={text}>{text}</div>)} />}
      {preview && !warnings.length && <Typography.Paragraph>Рисков соседства на новых местах не обнаружено.</Typography.Paragraph>}
      {error && <Alert type="error" showIcon message="Перемещение не выполнено" description={error}
        action={!preview && valid ? <Button onClick={() => { setError(undefined); setRetry(value => value + 1) }}>Повторить проверку</Button> : undefined} />}
    </Space>
  </Modal>
}
