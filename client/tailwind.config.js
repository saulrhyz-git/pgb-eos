/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#3b5fe0",
          600: "#2f4bc0",
          700: "#26399a",
        },
      },
    },
  },
  plugins: [],
};
