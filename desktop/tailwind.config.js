/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        azoth: {
          bg: "#fafafa",
          surface: "#f4f4f6",
          panel: "#ffffff",
          border: "#e5e5e5",
          muted: "#6b6b6b",
          text: "#111111",
          accent: "#2f6feb",
          accentDim: "#dce8ff",
          good: "#17a34a",
          warn: "#eab308",
          err: "#dc2626",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "SF Mono",
          "ui-monospace",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
