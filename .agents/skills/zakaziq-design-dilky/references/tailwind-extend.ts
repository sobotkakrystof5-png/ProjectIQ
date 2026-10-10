// Doplnit do theme.extend v tailwind.config.ts (sloučit s existujícím extend).
// POZOR: admin konzole už používá `brand`, `card`, `muted`, `primary`… a rádiusy `sm`/`md`/`lg`
// a `font-sans` (Inter). Nic z toho se nepřepisuje — Dílky mají vlastní názvy níže.
// Proměnné existují jen uvnitř [data-app="ws"] (viz tokens.css).

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export const dilkyExtend = {
  colors: {
    navy: {
      50: v('navy-50'), 100: v('navy-100'), 200: v('navy-200'), 300: v('navy-300'),
      400: v('navy-400'), 500: v('navy-500'), 600: v('navy-600'), 700: v('navy-700'),
      800: v('navy-800'), 900: v('navy-900'), 950: v('navy-950'),
    },
    ground: v('ground'),     // pozadí stránky
    surface: v('surface'),   // karty (v adminu je `card`, proto jiný název)
    ink: v('ink'),           // hlavní text
    quiet: v('quiet'),       // vedlejší text (v adminu je `muted`)
    signal: { DEFAULT: v('signal'), bg: v('signal-bg'), line: v('signal-line'), ink: v('signal-ink') },
    reward: v('reward'),
    danger: v('danger'),
  },
  fontFamily: {
    // Workspace dědí Instrument Sans z [data-app="ws"]; tyto třídy jsou pro akcent a čísla.
    ws: ['var(--font-instrument-sans)', 'system-ui', 'sans-serif'],
    accent: ['var(--font-instrument-serif)', 'Georgia', 'serif'],
    num: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
  },
  borderRadius: {
    tiny: '9px',    // drobné prvky
    chip: '12px',   // pole, malé karty
    box: '20px',    // karty
    panel: '24px',  // větší karty
    slab: '32px',   // velké panely
    hero: '40px',   // hero / footer landing page
  },
  transitionTimingFunction: { zq: 'cubic-bezier(.2,.8,.2,1)' },
  keyframes: {
    'zq-in': { from: { opacity: '0', transform: 'translateY(-16px) scale(.97)' }, to: { opacity: '1', transform: 'none' } },
    'zq-rise': { from: { opacity: '0', transform: 'translateY(28px)' }, to: { opacity: '1', transform: 'none' } },
    'zq-pulse': { '0%,100%': { opacity: '.10' }, '50%': { opacity: '.85' } },
    'zq-breathe': { '0%,100%': { opacity: '.95' }, '50%': { opacity: '.4' } },
    'zq-dot': { '0%': { boxShadow: '0 0 0 0 rgb(255 181 71 / .7)' }, '100%': { boxShadow: '0 0 0 12px rgb(255 181 71 / 0)' } },
    'zq-float': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
    'zq-grow': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
    'zq-marquee': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
    'zq-blink': { '0%,49%': { opacity: '1' }, '50%,100%': { opacity: '0' } },
  },
  animation: {
    'zq-in': 'zq-in .6s cubic-bezier(.2,.8,.2,1) both',
    'zq-rise': 'zq-rise .7s cubic-bezier(.2,.8,.2,1) both',
    'zq-pulse': 'zq-pulse 5s ease-in-out infinite',
    'zq-breathe': 'zq-breathe 3s ease-in-out infinite',
    'zq-dot': 'zq-dot 1.6s ease-out infinite',
    'zq-float': 'zq-float 5s ease-in-out infinite',
    'zq-grow': 'zq-grow 1s cubic-bezier(.2,.8,.2,1) both',
    'zq-marquee': 'zq-marquee 38s linear infinite',
    'zq-blink': 'zq-blink 1s step-end infinite',
  },
}
