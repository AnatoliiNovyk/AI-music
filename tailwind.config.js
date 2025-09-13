/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        wave: {
          '0%, 100%': { height: '20%' },
          '50%': { height: '80%' },
        }
      }
    },
  },
  plugins: [],
}
