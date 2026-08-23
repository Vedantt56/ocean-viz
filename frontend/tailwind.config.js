/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          dark: '#0B1325',
          panel: '#121D33',
          border: '#1E2D4A',
          accent: '#00D2FF',
        }
      }
    },
  },
  plugins: [],
}
