import '@ant-design/v5-patch-for-react-19'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../ui-polish.css'
import { TrainerScheduleView } from './TrainerScheduleView'

createRoot(document.getElementById('root')!).render(<TrainerScheduleView />)
