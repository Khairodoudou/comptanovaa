import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: {
            50:  "#e6f1fb",
            100: "#b5d4f4",
            200: "#85b7eb",
            400: "#378add",
            500: "#1a6fbf",
            600: "#185fa5",
            800: "#0c447c",
            900: "#042c53",
          },
          green: {
            50:  "#eaf3de",
            100: "#c0dd97",
            200: "#97c459",
            400: "#639922",
            500: "#2d8f5e",
            600: "#3b6d11",
            800: "#27500a",
            900: "#173404",
          },
        },
        status: {
          proposed: {
            bg:   "#faeeda",
            text: "#633806",
            border: "#ef9f27",
          },
          validated: {
            bg:   "#eaf3de",
            text: "#27500a",
            border: "#639922",
          },
          rejected: {
            bg:   "#fcebeb",
            text: "#501313",
            border: "#e24b4a",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 12px 0 rgba(0,0,0,0.08)",
      },
      animation: {
        "fade-in": "fadeIn 0.15s ease-out",
        "slide-in": "slideIn 0.2s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%":   { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;