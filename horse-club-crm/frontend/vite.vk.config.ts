import { fileURLToPath, pathToFileURL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
const tailwindPath = createRequire(new URL('../tma/package.json', import.meta.url)).resolve('@tailwindcss/vite')
const { default: tailwindcss } = await import(pathToFileURL(tailwindPath).href)

export default defineConfig({
  root: fileURLToPath(new URL('./vk-app', import.meta.url)),
  base: '/vk-app/',
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'], alias: { react: fileURLToPath(new URL('./node_modules/react', import.meta.url)), 'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)) } },
  build: { outDir: '../dist/vk-app', emptyOutDir: true, rolldownOptions: {
    output: { strictExecutionOrder: true },
  } },
})
