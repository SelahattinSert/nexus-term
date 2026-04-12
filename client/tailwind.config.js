/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ctp: {
          base: 'var(--ctp-base)',
          mantle: 'var(--ctp-mantle)',
          crust: 'var(--ctp-crust)',
          surface0: 'var(--ctp-surface0)',
          surface1: 'var(--ctp-surface1)',
          surface2: 'var(--ctp-surface2)',
          text: 'var(--ctp-text)',
          subtext0: 'var(--ctp-subtext0)',
          subtext1: 'var(--ctp-subtext1)',
          blue: 'var(--ctp-blue)',
          lavender: 'var(--ctp-lavender)',
          green: 'var(--ctp-green)',
          yellow: 'var(--ctp-yellow)',
          peach: 'var(--ctp-peach)',
          red: 'var(--ctp-red)',
          maroon: 'var(--ctp-maroon)',
        }
      }
    },
  },
  plugins: [],
}
