import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        "primary-glow": "var(--primary-glow)",
        secondary: "var(--secondary)",
        "secondary-foreground": "var(--secondary-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        destructive: "var(--destructive)",
        "destructive-foreground": "var(--destructive-foreground)",
        warning: "var(--warning)",
        "warning-foreground": "var(--warning-foreground)",
        "warning-bg": "var(--warning-bg)",
        success: "var(--success)",
        "success-foreground": "var(--success-foreground)",
        info: "var(--info)",
        "info-foreground": "var(--info-foreground)",
        "info-bg": "var(--info-bg)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        editable: "var(--editable)",
        "editable-border": "var(--editable-border)",
        sidebar: "var(--sidebar)",
        "sidebar-foreground": "var(--sidebar-foreground)",
        "sidebar-primary": "var(--sidebar-primary)",
        "sidebar-primary-foreground": "var(--sidebar-primary-foreground)",
        "sidebar-accent": "var(--sidebar-accent)",
        "sidebar-accent-foreground": "var(--sidebar-accent-foreground)",
        "sidebar-border": "var(--sidebar-border)",
        ink: "#172033",
        teal: {
          50: "#edfafa",
          100: "#d5f2f1",
          600: "#0f8c8f",
          700: "#0c7376"
        },
        honey: {
          50: "#fff9e8",
          100: "#fff0bd"
        }
      },
      boxShadow: {
        panel: "0 18px 50px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
