export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        polkadot: {
          50: '#FCE7F3',
          100: '#FBCFE8',
          500: '#E6007A',
          600: '#d518ee',
          700: '#8B5CF6'
        },
        cyber: {
          50: '#E0F2FE',
          500: '#e5eaeb',
          600: '#0891B2'
        },
        surface: '#111827',
        card: '#1F2937',
      },
      boxShadow: {
        neon: '0 24px 80px rgba(230, 0, 122, 0.18)',
      }
    },
  },
  plugins: [],
}
