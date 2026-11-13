import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

// Pojistka, že paleta Dílků má jedno místo (AD04, R-081). Literální `brand-*`
// v tailwind.config.ts zmizela v AD18 spolu s poslední třídou, která ji používala;
// zůstat musí, že hodnoty žijí jen v app/tokens-dilky.css na `:root`, takže platí
// i tam, kde není `data-app` (/login, /p, /h).

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

  it('paleta má všech 11 odstínů a žádný navíc', () => {
    expect(Object.keys(css).sort()).toEqual([...SHADES].sort())
  })

  it('literální brand-* v tailwind.config.ts už není (AD18)', () => {
    const tw = readFileSync(path.join(process.cwd(), 'tailwind.config.ts'), 'utf8')
    expect(tw).not.toMatch(/\bbrand:\s*\{/)
  })
})
