import { ServiceForm } from './form'
import { ServiceList } from './list'
import { EntryOverlay } from '../../components/EntryOverlay'
import { useNavigate } from 'react-router-dom'

export function ServiceCreate() {
  const navigate = useNavigate()
  return <><ServiceList /><EntryOverlay variant="drawer" open title="Новая услуга" width={720} footer={null} onCancel={() => navigate('/services')}>
    <ServiceForm action="create" />
  </EntryOverlay></>
}
