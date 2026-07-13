/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#2563eb', light: '#3b82f6', dark: '#1d4ed8' },
      },
    },
  },
  plugins: [],
}
