/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        luxury: {
          bg: '#E4DAD0',        // 01 — основной тёплый фон
          sand: '#EBD4AB',      // 02 — золотисто-песочный акцент
          brown: '#724C39',     // 03 — кожа / кнопки
          taupe: '#BF9D85',     // 04 — мягкий беж
          dark: '#3A2F2B',      // 05 — глубокий эспрессо (текст)
          card: '#FAF7F2',      // светлые карточки
          border: '#D8C8BB',    // рамки
          muted: '#6E5D53',     // второстепенный текст
        },
      },
      boxShadow: {
        luxury: '0 10px 30px -10px rgba(58, 47, 43, 0.08)',
        'luxury-hover': '0 20px 40px -15px rgba(58, 47, 43, 0.15)',
      },
    },
  },
  plugins: [],
};