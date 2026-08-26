import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ── Paleta Obelisco GCBA ──────────────────────────────────────────
      colors: {
        // Primario — Amarillo GCBA
        primary: {
          DEFAULT: '#FFD600',
          light: '#FFE600',
          dark: '#E6C200',
          foreground: '#000000',
        },
        // Secundario — Azul GCBA
        secondary: {
          DEFAULT: '#0066CC',
          dark: '#1E5B97',
          light: '#4D94DB',
          foreground: '#FFFFFF',
        },
        // Azul Noche — header, thead, logo sidebar
        navy: '#1A2B4A',
        // Neutros Obelisco
        gray: {
          50: '#F3F6F9',
          100: '#E9ECEF',
          200: '#DEE2E6',
          300: '#CED4DA',
          400: '#ADB5BD',
          500: '#6C757D',
          600: '#495057',
          700: '#38485C',
          800: '#212529',
          900: '#101828',
        },
        // Semánticos
        success: { DEFAULT: '#2E7D32', foreground: '#FFFFFF' },
        danger: { DEFAULT: '#C62828', foreground: '#FFFFFF' },
        warning: { DEFAULT: '#F57C00', foreground: '#FFFFFF' },
        info: { DEFAULT: '#0066CC', foreground: '#FFFFFF' },
        // Fondos
        background: '#F3F6F9',
        surface: '#FFFFFF',
      },
      // ── Tipografía Obelisco ───────────────────────────────────────────
      fontFamily: {
        primary: ['Nunito', 'system-ui', 'sans-serif'],
        secondary: ['Open Sans', 'system-ui', 'sans-serif'],
        sans: ['Open Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      // ── Border radius Obelisco ────────────────────────────────────────
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      // ── Sombras Obelisco ──────────────────────────────────────────────
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        DEFAULT: '0 4px 6px rgba(0,0,0,0.07)',
        md: '0 4px 6px rgba(0,0,0,0.07)',
        lg: '0 10px 15px rgba(0,0,0,0.1)',
        xl: '0 20px 25px rgba(0,0,0,0.15)',
      },
      // ── Layout ────────────────────────────────────────────────────────
      maxWidth: {
        content: '1200px',
      },
      width: {
        sidebar: '240px',
      },
      height: {
        header: '64px',
        'header-mobile': '56px',
      },
    },
  },
  plugins: [],
}

export default config
