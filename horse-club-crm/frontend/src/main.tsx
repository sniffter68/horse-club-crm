import '@ant-design/v5-patch-for-react-19';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './ui-polish.css'
import { RootRoutes } from './RootRoutes'
import { NativeApp } from './mobile/NativeApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NativeApp />
    <RootRoutes />
  </StrictMode>,
)
