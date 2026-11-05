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
          bg: 'var(--color-club-sand)',
          sand: 'var(--color-club-sand)',
          brown: 'var(--color-club-action)',
          taupe: 'var(--color-club-secondary)',
          dark: 'var(--color-club-ink)',
          deep: 'var(--color-club-deep)',
          card: 'var(--color-club-paper)',
          border: 'var(--color-club-secondary)',
          muted: 'var(--color-club-secondary)',
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