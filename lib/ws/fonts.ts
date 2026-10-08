// Písma systému Dílky. Načítají se jen v layoutech Workspace a landing page —
// kořenový app/layout.tsx (admin) zůstává na Interu.
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google'

const instrumentSans = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-instrument-sans',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  style: 'italic',
  display: 'swap',
  variable: '--font-instrument-serif',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
})

/** Třídy, které na prvku nadefinují CSS proměnné všech tří písem. */
export const wsFontVariables = [instrumentSans.variable, instrumentSerif.variable, jetbrainsMono.variable].join(' ')
