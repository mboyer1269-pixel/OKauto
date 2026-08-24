/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8ff",
          100: "#d9f0ff",
          200: "#bce6ff",
          300: "#7dd3fc",
          400: "#39bdf8",
          500: "#0e91e8",
          600: "#0967d2",
          700: "#0752ae",
          800: "#0a438c",
          900: "#0b396f",
        },
      },
    },
  },
  plugins: [],
};
