/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#3f8f46", // Pi green-ish
          dark: "#2f6b34",
          light: "#65b96e"
        },
        accent: "#f9b234" // Pi gold
      }
    },
  },
  plugins: [],
};
