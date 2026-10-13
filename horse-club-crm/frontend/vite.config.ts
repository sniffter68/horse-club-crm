import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Preserve initialization order across dependency chunks (Refine/Ant Design share contexts).
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            { name: 'react-runtime', test: /node_modules[\\/](react|react-dom|react-is|scheduler)[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules/, maxSize: 400_000, priority: 10 },
          ],
        },
      },
    },
  },
  server: { proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: false },
    '/uploads': { target: 'http://localhost:3000', changeOrigin: false },
  } },
})
