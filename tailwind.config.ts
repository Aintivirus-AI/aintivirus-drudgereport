import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Crypto theme colors
        background: "#0a0a0a",
        foreground: "#ededed",
        neon: {
          cyan: "#00ffff",
          purple: "#ff00ff",
          green: "#00ff00",
        },
        dark: {
          100: "#1a1a1a",
          200: "#2a2a2a",
          300: "#3a3a3a",
        },
      },
      fontFamily: {
        mono: ["var(--font-jetbrains-mono)", "JetBrains Mono", "Fira Code", "monospace"],
        sans: ["var(--font-space-grotesk)", "Space Grotesk", "system-ui", "sans-serif"],
        display: ["var(--font-syne)", "Syne", "system-ui", "sans-serif"],
      },
      boxShadow: {
        neon: "0 0 10px #00ffff, 0 0 20px #00ffff40",
        "neon-purple": "0 0 10px #ff00ff, 0 0 20px #ff00ff40",
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px #00ffff, 0 0 10px #00ffff40" },
          "100%": { boxShadow: "0 0 20px #00ffff, 0 0 40px #00ffff60" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
