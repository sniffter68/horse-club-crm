import '@ant-design/v5-patch-for-react-19'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../ui-polish.css'
import '../../../tma/src/styles.css'
import './vk.css'
import { VkMiniApp, MiniAppBoundary } from './VkMiniApp'

document.body.classList.add('vk-mini-app')
createRoot(document.getElementById('root')!).render(<MiniAppBoundary retry={() => window.location.reload()}><VkMiniApp /></MiniAppBoundary>)
