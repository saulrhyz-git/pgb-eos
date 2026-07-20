/** @type {import('tailwindcss').Config} */
export default {
  // Class-based dark mode: a "dark" class on <html> (toggled by
  // ThemeContext, see src/contexts/ThemeContext.tsx) switches every dark:
  // variant on, rather than following the OS-level prefers-color-scheme
  // media query directly — this is what lets the in-app toggle override
  // whatever the system is set to.
  darkMode: "class",
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
          // 200-400 are new (only 50/100/500/600/700 existed before) — added
          // for dark-mode text/border variants that need a lighter tint of
          // the brand blue than 500 to stay readable against a dark
          // background, plus 800/900 for dark-mode tinted badge backgrounds.
          200: "#b9cdfb",
          300: "#93b0f7",
          400: "#6a8ced",
          500: "#3b5fe0",
          600: "#2f4bc0",
          700: "#26399a",
          800: "#1f2f79",
          900: "#182353",
        },
      },
    },
  },
  plugins: [],
};
