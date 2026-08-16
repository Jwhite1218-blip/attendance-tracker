/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        present: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
        absent: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
        late: { bg: '#fef3c7', text: '#854d0e', border: '#fcd34d' },
        excused: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
        remote: { bg: '#f3e8ff', text: '#6b21a8', border: '#c4b5fd' },
        // Warren Township brand palette
        brand: {
          50: '#FBF6EC',
          100: '#F5EAD1',
          200: '#E9D3A3',
          300: '#DCBB74',
          400: '#C6A25C',
          500: '#AB8A52',
          600: '#8F7141',
          700: '#715728',
          800: '#55401D',
          900: '#3A2C14',
        },
        charcoal: {
          50: '#F5F5F6',
          100: '#E4E4E6',
          200: '#B8B7BC',
          300: '#8C8A92',
          400: '#5F5D66',
          500: '#3F3E44',
          600: '#34333A',
          700: '#2C2B31',
          800: '#232228',
          900: '#1A191E',
        },
      },
    },
  },
  plugins: [],
}
