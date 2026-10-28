/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#07090e',
          900: '#0d121d',
          850: '#111726',
          800: '#1e293b'
        }
      }
    },
  },
  plugins: [],
}
