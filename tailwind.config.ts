import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "campus-black": "#050505",
        "accent-amber": "#FFB000",
        "accent-blue": "#2563EB",
        "text-primary": "#FFFFFF",
        "text-secondary": "#A1A1AA",
      },
    },
  },
  plugins: [],
} satisfies Config;
