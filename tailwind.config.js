/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        success: '#22c55e',
        warning: '#eab308',
        danger: '#ef4444',
      }
    },
  },
  plugins: [],
}

