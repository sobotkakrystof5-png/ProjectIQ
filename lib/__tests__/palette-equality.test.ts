import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import config from '@/tailwind.config'

// Pojistka proti rozjetí palet (AD04, R-081). `brand-*` v tailwind.config.ts je literální
// hex a používají ho dosud nepřepsané obrazovky adminu, `navy-*` se kompiluje na
// rgb(var(--navy-…)) z app/tokens-dilky.css. Dokud obě existují vedle sebe, musí mít
// stejné hodnoty — jinak by přejmenování brand- → navy- změnilo barvy.

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

function tokensFromCss() {
  const css = withoutComments(readFileSync(path.join(process.cwd(), 'app/tokens-dilky.css'), 'utf8'))
  const root = css.slice(css.indexOf(':root'))
  const out: Record<string, string> = {}
  for (const match of root.matchAll(/--navy-(\d{2,3}):\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*;/g)) {
    const [, shade, r, g, b] = match
    out[shade] = '#' + [r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  }
  return out
}

describe('paleta Dílků', () => {
  const css = tokensFromCss()
  const brand = (config.theme?.extend?.colors as { brand: Record<string, string> }).brand

  it('tokens-dilky.css je na :root, ne jen v [data-app]', () => {
    const file = withoutComments(readFileSync(path.join(process.cwd(), 'app/tokens-dilky.css'), 'utf8'))
    expect(file).toContain(':root {')
    expect(file).not.toContain('[data-app=')
  })

  it('app/globals.css paletu importuje, takže platí i bez data-app (/login, /p, /h)', () => {
    expect(readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')).toContain("@import './tokens-dilky.css';")
  })

  it('ani ws-tokens.css, ani admin-tokens.css hodnoty palety neduplikují', () => {
    for (const file of ['app/ws-tokens.css', 'app/admin-tokens.css']) {
      const text = readFileSync(path.join(process.cwd(), file), 'utf8')
      const light = withoutComments(text).split('[data-theme="dark"]')[0]
      expect(light, file).not.toMatch(/--navy-\d{2,3}:/)
    }
  })

  it.each(SHADES)('brand-%s === --navy-%s', (shade) => {
    expect(css[shade]).toBeDefined()
    expect(css[shade]).toBe(brand[shade].toLowerCase())
  })

  it('zná všech 11 odstínů z obou stran', () => {
    expect(Object.keys(css).sort()).toEqual([...SHADES].sort())
    expect(Object.keys(brand).sort()).toEqual([...SHADES].sort())
  })
})
