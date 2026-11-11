import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import config from '@/tailwind.config'

// Písma Dílků platí od AD04 (R-081) pro celé repo. Proměnné musí být na <html>,
// jinak je `body` v app/globals.css nezná a admin spadne na systémové písmo.

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8')

describe('písma Dílků', () => {
  it('wsFontVariables jsou na <html> v kořenovém layoutu', () => {
    const layout = read('app/layout.tsx')
    expect(layout).toContain("import { wsFontVariables } from '@/lib/ws/fonts'")
    expect(layout).toMatch(/<html lang="cs" className=\{wsFontVariables\}>/)
  })

  // lib/ws/fonts.ts nejde z testu importovat (next/font/google běží jen v buildu Nextu).
  it('wsFontVariables nese všechna tři písma', () => {
    const fonts = read('lib/ws/fonts.ts')
    for (const variable of ['--font-instrument-sans', '--font-instrument-serif', '--font-jetbrains-mono']) {
      expect(fonts).toContain(variable)
    }
    expect(fonts).toMatch(/export const wsFontVariables = \[instrumentSans\.variable, instrumentSerif\.variable, jetbrainsMono\.variable\]/)
  })

  it('body používá Instrument Sans a nenačítá se Inter', () => {
    const globals = read('app/globals.css')
    expect(globals).toContain('font-family: var(--font-instrument-sans), system-ui, sans-serif;')
    expect(globals).not.toContain('fonts.googleapis.com')
    expect(globals).not.toContain('Inter')
    // znakové varianty Interu (cv02…) na Instrument Sans nepatří
    expect(globals).not.toContain('font-feature-settings')
  })

  it('font-sans v Tailwindu není Inter', () => {
    const sans = (config.theme?.extend?.fontFamily as { sans: string[] }).sans
    expect(sans[0]).toBe('var(--font-instrument-sans)')
  })

  it('CSP profilu admin už nepotřebuje výjimku na Google Fonts', () => {
    expect(read('lib/security/csp.ts')).not.toMatch(/'(style|font)-src': \['https:\/\/fonts\./)
  })

  it('* { border-border } zůstává záměrně', () => {
    expect(read('app/globals.css')).toContain('@apply border-border;')
  })
})
