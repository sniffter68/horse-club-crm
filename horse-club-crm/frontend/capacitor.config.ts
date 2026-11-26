import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ru.horseclub68.staff',
  appName: 'Horse Club CRM',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: { SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' } },
}

// Capacitor CLI requires a default export for its configuration entrypoint.
export default config
