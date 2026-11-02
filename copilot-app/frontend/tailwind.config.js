/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: '#070B0A',
          900: '#0B1311',
          850: '#0E1614',
          800: '#131E1B',
          700: '#1A2824',
          600: '#223831',
        },
        zytagreen: {
          DEFAULT: '#00E676',
          emerald: '#00E676',
          mint: '#34D399',
          dark: '#0B2A1E',
          border: '#165038',
        }
      },
      fontFamily: {
        sans: ['Satoshi', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
