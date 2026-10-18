import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

// RD03: Workspace používá Framer Motion jen přes `m` + LazyMotion (WsRoot) a paletu
// ⌘K načítá líně. Obyčejné `motion` by do první stránky vrátilo celý balíček (~40 kB gz).

const ROOT = path.resolve(__dirname, '../../..')
const DIRS = ['components/ws', 'components/ui', 'app/w', 'app/r', 'app/z', 'app/embed', 'lib/ws']
const SKIP = [`${path.sep}__tests__${path.sep}`, `${path.sep}%5Fdesign${path.sep}`, `${path.sep}_design${path.sep}`]

function files(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (SKIP.some((s) => (p + path.sep).includes(s))) continue
    if (e.isDirectory()) out.push(...files(p))
    else if (/\.(tsx?|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}

const sources = DIRS.flatMap((d) => files(path.join(ROOT, d))).map((f) => ({ file: path.relative(ROOT, f), text: fs.readFileSync(f, 'utf8') }))

describe('velikost balíčku Workspace', () => {
  it('žádný soubor Workspace neimportuje `motion` z framer-motion (jen `m`)', () => {
    const offenders = sources.filter((s) => /import\s*\{[^}]*\bmotion\b[^}]*\}\s*from\s*'framer-motion'/.test(s.text)).map((s) => s.file)
    expect(offenders).toEqual([])
  })

  it('cmdk se importuje jen z palety a ta se načítá dynamicky', () => {
    const importers = sources.filter((s) => /from\s*'cmdk'|components\/ui\/command'/.test(s.text)).map((s) => s.file)
    expect(importers.sort()).toEqual(['components/ui/command.tsx', 'components/ws/app/command-palette.tsx'].sort())
    const frame = sources.find((s) => s.file === 'components/ws/app/app-frame.tsx')!.text
    expect(frame).not.toMatch(/import\s*\{\s*CommandPalette\s*\}\s*from/)
    expect(frame).toMatch(/dynamic\(\(\)\s*=>\s*import\('\.\/command-palette'\)/)
  })
})
