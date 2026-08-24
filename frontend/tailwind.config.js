/** @type {import('tailwindCSS').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          deep: '#030712',      // Deepest background space
          dark: '#070f21',      // Primary workspace bg
          card: '#0b162c',      // Card surface
          panel: '#101d36',     // Floating panels & sidebar bg
          border: '#1b2e50',    // Clean subtle borders
          borderLight: '#263e69', // Highlight borders
          cyan: '#00d2ff',      // Primary scientific cyan accent
          blue: '#1d4ed8',      // Deep blue
          muted: '#64748b',     // Muted text
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
        'cyan-glow': '0 0 20px -3px rgba(0, 210, 255, 0.25)',
      }
    },
  },
  plugins: [],
}

