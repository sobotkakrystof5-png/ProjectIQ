import type { Config } from 'tailwindcss'
import { dilkyExtend } from './lib/ws/tailwind-dilky'

const config: Config = {
  // `.dark` pro admin (beze změny) + `data-theme="dark"` pro Workspace (R-027)
  darkMode: ['variant', ['&:is(.dark *)', '&:is([data-theme="dark"] *)']],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Dílky platí pro celé repo (R-081); Inter se od AD04 nenačítá.
        sans: ['var(--font-instrument-sans)', 'system-ui', 'sans-serif'],
        ...dilkyExtend.fontFamily,
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        brand: {
          50:  '#eef2fb',
          100: '#dce7f7',
          200: '#b8ceef',
          300: '#8aaee3',
          400: '#5c8dd3',
          500: '#3a6ec4',
          600: '#2b57a8',
          700: '#23478b',
          800: '#1b3868',
          900: '#132850',
          950: '#0c1a36',
        },
        ...dilkyExtend.colors,
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        ...dilkyExtend.borderRadius,
      },
      transitionTimingFunction: dilkyExtend.transitionTimingFunction,
      keyframes: dilkyExtend.keyframes,
      animation: dilkyExtend.animation,
    },
  },
  plugins: [],
}

export default config
