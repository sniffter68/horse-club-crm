import { Alert, Button } from 'antd'
import { useNavigate } from 'react-router-dom'

export function ClubClosedNotice({ canConfigure }: { canConfigure: boolean }) {
  const navigate = useNavigate()
  return <Alert type="info" showIcon message="Клуб не работает в этот день"
    action={canConfigure && <Button size="small" onClick={() => navigate('/settings?tab=schedule')}>Настроить график работы</Button>} />
}
