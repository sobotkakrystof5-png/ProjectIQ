// Písma systému Dílky. Od AD04 (R-081) je nese <html> v kořenovém app/layout.tsx,
// takže platí pro celé repo včetně admin konzole, /login a portálu.
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
