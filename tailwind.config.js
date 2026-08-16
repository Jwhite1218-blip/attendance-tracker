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
      },
    },
  },
  plugins: [],
}
