import { useEffect } from 'react'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { handleAndroidBack } from './backButton'

export function NativeApp() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return
    let disposed = false
    let listener: PluginListenerHandle | undefined
    void App.addListener('backButton', handleAndroidBack).then(handle => {
      if (disposed) void handle.remove()
      else listener = handle
    }).catch(console.error)
    const updateStatusBar = () => {
      void StatusBar.setStyle({ style: document.documentElement.dataset.theme === 'dark' ? Style.Dark : Style.Light }).catch(console.error)
    }
    updateStatusBar()
    const observer = new MutationObserver(updateStatusBar)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      disposed = true
      observer.disconnect()
      void listener?.remove()
    }
  }, [])
  return null
}
