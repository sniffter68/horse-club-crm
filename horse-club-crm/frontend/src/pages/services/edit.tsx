import { ServiceForm } from './form'
import { ServiceList } from './list'
import { EntryOverlay } from '../../components/EntryOverlay'
import { isUuid } from '../../uuid'
import { Result } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'

export function ServiceEdit() {
  const navigate = useNavigate()
  const { id } = useParams()
  return <><ServiceList /><EntryOverlay variant="drawer" open title="Редактирование услуги" width={720} footer={null} onCancel={() => navigate('/services')}>
    {id && isUuid(id) ? <ServiceForm action="edit" /> : <Result status="404" title="Услуга не найдена" />}
  </EntryOverlay></>
}
