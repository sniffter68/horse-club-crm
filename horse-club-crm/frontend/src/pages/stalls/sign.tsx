import { Button, Modal } from 'antd'
import { feedingRows, sexes, zones, type MapStall } from './mapTypes'

export function StallSign({ stall, onClose }: { stall: MapStall; onClose: () => void }) {
  const horse = stall.horse
  const feeding = feedingRows(horse?.feedingNotes ?? null)
  return <Modal open title="Табличка на денник" width={760} onCancel={onClose}
    footer={<Button type="primary" onClick={() => window.print()}>Печать</Button>}>
    <article className="stall-sign" aria-label="Табличка на денник">
      <p>{zones[stall.zone]} · Денник № {stall.number ?? stall.name}</p>
      <h1>{horse?.name ?? 'Свободный денник'}</h1>
      <p>{horse?.sex ? sexes[horse.sex] : 'Пол не указан'} · {horse?.birthYear ? `${horse.birthYear} г. р.` : 'Год рождения не указан'}</p>
      <p>{horse ? horse.ownerType === 'private' ? 'Частный постой' : 'Клубная лошадь' : 'Лошадь не назначена'}</p>
      <p>Владелец: {horse?.owner ? horse.owner.name || [horse.owner.firstName, horse.owner.lastName].filter(Boolean).join(' ') : 'Не указан'}<br />
        Контакт: {horse?.owner?.phone ?? 'Не указан'}</p>
      <table><caption>Рацион кормления</caption><thead><tr><th scope="col">Время / корм</th><th scope="col">Рацион</th></tr></thead>
        <tbody>{feeding.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value.trim() || 'Не указан'}</td></tr>)}</tbody></table>
      {feeding.rest && <p className="stall-sign-notes">{feeding.rest}</p>}
      <h2>Заметки для конюха</h2><p className="stall-sign-notes">{stall.notes || 'Нет заметок'}</p>
      {stall.warnings.map(warning => <p key={warning.neighborId}>{warning.message} · денник {warning.neighborNumber}</p>)}
    </article>
  </Modal>
}
