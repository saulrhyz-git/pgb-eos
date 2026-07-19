/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Extra breakpoint below the default "sm" (640px) for the handful of
      // spots where even 2 columns is cramped on the smallest phones
      // (iPhone SE / older 360-375px-wide devices) but is fine from ~475px up.
      screens: {
        xs: "475px",
      },
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
