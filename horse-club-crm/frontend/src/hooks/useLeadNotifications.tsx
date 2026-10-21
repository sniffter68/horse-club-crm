import { useCallback, useEffect, useRef, useState } from 'react'
import { App, Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../httpClient'
import { isUuid } from '../uuid'

export const LEAD_SOUND_KEY = 'horsecrm.lead-notification-sound'
interface LeadCreated {
  id: string; clientName: string; phone: string; serviceName?: string; createdAt: string
}
const permissionNow = () => typeof Notification !== 'undefined' && window.isSecureContext ? Notification.permission : 'unsupported'
const soundPreference = () => { try { return localStorage.getItem(LEAD_SOUND_KEY) !== 'false' } catch { return true } }

export function useLeadNotifications() {
  const { notification, message } = App.useApp()
  const navigate = useNavigate()
  const [permission, setPermission] = useState(permissionNow)
  const [soundEnabled, setSoundEnabled] = useState(soundPreference)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [connected, setConnected] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const sound = useRef(soundEnabled)

  const playSound = useCallback(() => {
    if (!sound.current) return
    const player = audio.current ??= new Audio('/sounds/chime.wav')
    player.volume = 0.28
    player.currentTime = 0
    void player.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))
  }, [])
  const toggleSound = (enabled: boolean) => {
    sound.current = enabled
    setSoundEnabled(enabled)
    try { localStorage.setItem(LEAD_SOUND_KEY, String(enabled)) } catch { /* Preference stays valid for this session. */ }
    if (enabled) playSound()
    else { audio.current?.pause(); setAudioBlocked(false) }
  }
  const enable = async () => {
    playSound() // Start during the user gesture, before awaiting browser permission.
    if (permissionNow() === 'unsupported') return
    setRequesting(true)
    try { setPermission(await Notification.requestPermission()) }
    catch { void message.warning('Не удалось включить уведомления. Проверьте разрешения сайта в браузере.') }
    finally { setRequesting(false) }
  }

  useEffect(() => {
    const sync = () => { setPermission(permissionNow()); sound.current = soundPreference(); setSoundEnabled(sound.current) }
    window.addEventListener('focus', sync)
    window.addEventListener('storage', sync)
    // Unlock the same media element after the first interaction following a reload.
    const unlock = () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
      if (!sound.current) return
      const player = audio.current ??= new Audio('/sounds/chime.wav')
      player.volume = 0
      void player.play().then(() => { player.pause(); player.currentTime = 0; player.volume = 0.28; setAudioBlocked(false) }).catch(() => setAudioBlocked(true))
    }
    document.addEventListener('pointerdown', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener('storage', sync)
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
      audio.current?.pause()
    }
  }, [])

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const stream = new EventSource(`${API_URL}/leads/events`, { withCredentials: true })
    const seen = new Set<string>()
    const systemNotifications = new Set<Notification>()
    stream.onopen = () => setConnected(true)
    stream.onerror = () => setConnected(false) // EventSource reconnects, including in a background tab.
    const receive = (event: MessageEvent<string>) => {
      let payload: LeadCreated
      try {
        const value: unknown = JSON.parse(event.data)
        if (!value || typeof value !== 'object') return
        const row = value as Partial<LeadCreated>
        if (typeof row.id !== 'string' || !isUuid(row.id) || typeof row.clientName !== 'string' || typeof row.phone !== 'string'
          || typeof row.createdAt !== 'string' || (row.serviceName !== undefined && typeof row.serviceName !== 'string')) return
        payload = row as LeadCreated
      } catch { return }
      if (seen.has(payload.id)) return
      seen.add(payload.id)
      if (seen.size > 500) seen.delete(seen.values().next().value!)
      const open = () => {
        window.focus()
        navigate('/#pending-leads')
        window.dispatchEvent(new Event('lead:created'))
        notification.destroy(`lead-${payload.id}`)
      }
      const description = `${payload.clientName} (${payload.phone}) — ${payload.serviceName || 'Первое занятие'}`
      notification.info({ key: `lead-${payload.id}`, message: '🐴 Новая заявка с сайта!', description,
        duration: 12, role: 'status', actions: <Button type="primary" onClick={open}>Открыть заявку</Button> })
      playSound()
      window.dispatchEvent(new Event('lead:created'))
      if (permissionNow() === 'granted') {
        try {
          const push = new Notification('🐴 Новая заявка с сайта!', {
            body: description, icon: '/favicon.svg', tag: `lead-${payload.id}`, silent: true,
          })
          systemNotifications.add(push)
          push.onclose = () => systemNotifications.delete(push)
          push.onclick = () => { open(); push.close(); systemNotifications.delete(push) }
        } catch { /* Toast and sound still work where the Notification constructor is unavailable. */ }
      }
    }
    stream.addEventListener('lead:created', receive)
    return () => {
      stream.close()
      systemNotifications.forEach(push => { push.onclick = null; push.close() })
      seen.forEach(id => notification.destroy(`lead-${id}`))
    }
  }, [navigate, notification, playSound])

  return { permission, soundEnabled, audioBlocked, connected, requesting, enable, toggleSound, playSound }
}
