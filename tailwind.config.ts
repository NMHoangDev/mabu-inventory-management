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
        },
        // Namespace riêng cho storefront /shop (xem .shop-scope trong globals.css) —
        // KHÔNG dùng tên trùng với token dashboard ở trên (primary/border/muted...)
        // để tránh đổi màu toàn bộ (dashboard).
        "shop-primary": "var(--shop-primary)",
        "shop-primary-dark": "var(--shop-primary-dark)",
        "shop-primary-light": "var(--shop-primary-light)",
        "shop-surface": "var(--shop-surface)",
        "shop-text": "var(--shop-text)",
        "shop-text-muted": "var(--shop-text-muted)",
        "shop-border": "var(--shop-border)"
      },
      fontFamily: {
        shop: ["Geist", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        panel: "0 18px 50px rgba(15, 23, 42, 0.08)"
      },
      animation: {
        "shop-slide-in-right": "shopSlideInRight 0.3s ease-out",
        "shop-slide-in-up": "shopSlideInUp 0.3s ease-out",
        "shop-fade-in": "shopFadeIn 0.2s ease-out"
      },
      keyframes: {
        shopSlideInRight: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" }
        },
        shopSlideInUp: {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" }
        },
        shopFadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        }
      }
    }
  },
  plugins: []
};

export default config;
