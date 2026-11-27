import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: fileURLToPath(new URL('./vk-staff', import.meta.url)),
  base: '/vk-app/staff/',
  plugins: [react()],
  build: { outDir: '../dist/vk-app/staff', emptyOutDir: true, rolldownOptions: {
    output: { strictExecutionOrder: true },
  } },
})
