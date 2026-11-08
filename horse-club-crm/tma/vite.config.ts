import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/tma/',
  plugins: [tailwindcss()],
  build: { outDir: '../frontend/dist/tma', emptyOutDir: true, target: 'es2020', cssTarget: 'chrome120',
    minify: 'terser', terserOptions: { ecma: 2020, compress: { passes: 3 }, format: { comments: false } } },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
