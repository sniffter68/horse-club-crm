import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/tma/',
  plugins: [tailwindcss()],
  // Keep the production WebView bundle within 150 KB; development retains React DevTools.
  define: process.env.NODE_ENV === 'production' ? { __REACT_DEVTOOLS_GLOBAL_HOOK__: 'undefined' } : {},
  build: { outDir: '../frontend/dist/tma', emptyOutDir: true, target: 'es2020', cssTarget: 'chrome120',
    // A single entry without dynamic imports has no modulepreload dependencies.
    modulePreload: { polyfill: false },
    minify: 'terser', terserOptions: { ecma: 2020, compress: { passes: 3 }, format: { comments: false } } },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
