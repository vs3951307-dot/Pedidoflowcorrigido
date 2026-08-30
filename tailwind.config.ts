import type { Config } from "tailwindcss";

/**
 * PEDIDOFLOW — DESIGN TOKENS
 * -----------------------------------------------------------------------
 * Identidade: "Brasa" — o calor do forno a lenha, tratado com a disciplina
 * visual de um produto Apple/Stripe. Fundo claro tipo papel, tinta quase
 * preta para leitura confortável, um único vermelho-terracota de assinatura
 * (herdado do logo da Disk Pizza Rozeno) e uma escala de status semânticos
 * suave, nunca berrante — pensada para uso prolongado por qualquer idade.
 * -----------------------------------------------------------------------
 */

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1.5rem",
        sm: "2rem",
        lg: "3rem",
        xl: "4rem",
      },
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Escala pensada para "letras grandes" e conforto de leitura.
        xs: ["0.8125rem", { lineHeight: "1.25rem" }],
        sm: ["0.9375rem", { lineHeight: "1.5rem" }],
        base: ["1.0625rem", { lineHeight: "1.75rem" }],
        lg: ["1.1875rem", { lineHeight: "1.85rem" }],
        xl: ["1.375rem", { lineHeight: "2rem" }],
        "2xl": ["1.75rem", { lineHeight: "2.25rem" }],
        "3xl": ["2.125rem", { lineHeight: "2.5rem" }],
        "4xl": ["2.75rem", { lineHeight: "3.1rem", letterSpacing: "-0.01em" }],
        "5xl": ["3.5rem", { lineHeight: "3.8rem", letterSpacing: "-0.02em" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: "#FCF3F1",
          100: "#F8E3DE",
          200: "#EFC2B8",
          300: "#E19E8D",
          400: "#CD7360",
          500: "#B0503C",
          600: "#953C2A", // primary
          700: "#7A3122",
          800: "#5F261A",
          900: "#471C13",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // Cores exclusivas da landing comercial. As variáveis só existem dentro
        // de `.pf-landing` (ver globals.css) — no app elas nunca são resolvidas,
        // e por isso nenhuma tela do produto muda de cor por causa disto.
        brand: {
          DEFAULT: "hsl(var(--pf-brand))",
          foreground: "hsl(var(--pf-brand-foreground))",
          soft: "hsl(var(--pf-brand-soft))",
        },
        accent2: "hsl(var(--pf-accent-2))",
        // Escala neutra quente ("tinta"), não cinza-frio de sistema operacional.
        ink: {
          50: "#F7F6F4",
          100: "#EEEBE7",
          200: "#DEDAD3",
          300: "#C2BCB2",
          400: "#9B9388",
          500: "#797165",
          600: "#5C554B",
          700: "#453F38",
          800: "#2E2A25",
          900: "#1C1916",
        },
        // Status semânticos das mesas (ver DESIGN_SYSTEM.md)
        status: {
          free: {
            DEFAULT: "#2E8B57",
            bg: "#EAF6EF",
            border: "#BFE3CE",
          },
          waiting: {
            DEFAULT: "#B8790F",
            bg: "#FBF1E2",
            border: "#EFD6A8",
          },
          sent: {
            DEFAULT: "#3459B4",
            bg: "#EAEFFB",
            border: "#C1D0F0",
          },
          bill: {
            DEFAULT: "#6E4FA6",
            bg: "#F1ECFA",
            border: "#D7C8EF",
          },
          occupied: {
            DEFAULT: "#B23B2E",
            bg: "#FBEAE7",
            border: "#EFC3BA",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        xl: "calc(var(--radius) + 6px)",
        "2xl": "calc(var(--radius) + 14px)",
      },
      boxShadow: {
        // Sombras suaves, quentes, nunca duras — "papel elevado", não "vidro".
        soft: "0 1px 2px rgba(30, 20, 15, 0.04), 0 8px 24px -8px rgba(30, 20, 15, 0.10)",
        card: "0 1px 3px rgba(30, 20, 15, 0.05), 0 12px 32px -12px rgba(30, 20, 15, 0.14)",
        lifted: "0 2px 6px rgba(30, 20, 15, 0.06), 0 20px 48px -16px rgba(30, 20, 15, 0.20)",
        glow: "0 0 0 4px rgba(149, 60, 42, 0.10)",
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "ember-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(184, 121, 15, 0.35)" },
          "50%": { boxShadow: "0 0 0 8px rgba(184, 121, 15, 0)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "ember-pulse": "ember-pulse 2.2s ease-in-out infinite",
        "fade-in": "fade-in 0.25s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
