import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Strážce proti XSS. Neprohledává chování, ale zdrojový kód: hlídá, aby se do
// repa nevrátily konstrukce, kterými cizí text končí jako spustitelné HTML.
// Je to stejný nápad jako `admin-classes.test.ts` — pravidlo, které drží test,
// vydrží déle než pravidlo v dokumentaci. Každá výjimka má v seznamu důvod;
// nová výjimka = nové rozhodnutí (`.claude/security/DECISIONS.md`), ne úprava
// seznamu bez ptaní.

const ROOT = process.cwd()
const SCAN = ['app', 'components', 'lib', 'proxy.ts']
const EXTENSIONS = /\.(ts|tsx|js|mjs)$/

function walk(entry: string, out: string[] = []): string[] {
  const full = path.join(ROOT, entry)
  let children: import('node:fs').Dirent[]
  try {
    children = readdirSync(full, { withFileTypes: true })
  } catch {
    // Jednotlivý soubor (`proxy.ts`).
    if (EXTENSIONS.test(entry)) out.push(entry)
    return out
  }
  for (const child of children) {
    if (child.name === 'node_modules' || child.name === '.next' || child.name === '__tests__') continue
    const rel = path.join(entry, child.name)
    if (child.isDirectory()) walk(rel, out)
    else if (EXTENSIONS.test(child.name) && !/\.test\.[tj]sx?$/.test(child.name)) out.push(rel)
  }
  return out
}

const FILES = SCAN.flatMap((entry) => walk(entry)).map((file) => ({
  file: file.split(path.sep).join('/'),
  source: readFileSync(path.join(ROOT, file), 'utf8'),
}))

/** Řádky se shodou, ať chybová hláška ukáže přesně kde. */
function hits(pattern: RegExp, only?: (file: string) => boolean): string[] {
  const found: string[] = []
  for (const { file, source } of FILES) {
    if (only && !only(file)) continue
    source.split('\n').forEach((line, index) => {
      if (pattern.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) found.push(`${file}:${index + 1}  ${line.trim()}`)
    })
  }
  return found
}

describe('xss-guard', () => {
  it('prohledává smysluplný počet souborů (kontrola, že se test nevyprázdnil)', () => {
    expect(FILES.length).toBeGreaterThan(300)
  })

  it('dangerouslySetInnerHTML jen u dvou zapsaných výjimek', () => {
    const allowed: Record<string, RegExp> = {
      // JSON-LD prochází `jsonLdString()` → `jsonForScript()` (escapuje `<`).
      'app/(marketing)/page.tsx': /jsonLdString\(/,
      // Neměnná konstanta se skriptem pro motiv, spouští se s nonce z CSP.
      'components/ws/ws-root.tsx': /__html:\s*SYSTEM_THEME_SCRIPT/,
    }
    const found = hits(/dangerouslySetInnerHTML/).filter((hit) => {
      const file = hit.split(':')[0]!
      const rule = allowed[file]
      return !(rule && rule.test(hit))
    })
    expect(found, `Nové dangerouslySetInnerHTML — použijte jsonForScript() nebo přidejte výjimku s důvodem:\n${found.join('\n')}`).toEqual([])
  })

  it('přímý zápis HTML do DOM (innerHTML, outerHTML, insertAdjacentHTML, document.write) jen v TradingView', () => {
    // components/TradingViewChart.tsx vkládá konfigurační JSON pro externí widget
    // (hodnoty z vlastního kódu, ne od uživatele) a jinak jen maže obsah kontejneru.
    const found = hits(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write\(/, (f) => f !== 'components/TradingViewChart.tsx')
    expect(found, found.join('\n')).toEqual([])
  })

  it('žádné eval() ani new Function()', () => {
    const found = hits(/(^|[^\w.])eval\(|new Function\(/)
    expect(found, found.join('\n')).toEqual([])
  })

  it('každý iframe se srcDoc je sandboxovaný bez povolení (`sandbox=""`)', () => {
    const bad: string[] = []
    for (const { file, source } of FILES) {
      for (const match of source.matchAll(/<iframe\b[^>]*?\bsrcDoc\b[^>]*?>/g)) {
        if (!/\bsandbox=""/.test(match[0])) bad.push(`${file}: ${match[0].slice(0, 100)}`)
      }
    }
    expect(bad, `srcDoc bez sandbox="" spustí cizí HTML s právy stránky:\n${bad.join('\n')}`).toEqual([])
  })

  it('escapování HTML je jen v lib/security/html.ts, žádná další vlastní kopie', () => {
    const definitions = hits(/function\s+escapeHtml\b|const\s+escapeHtml\s*=/, (f) => f !== 'lib/security/html.ts')
    expect(definitions, `Použijte escapeHtml z '@/lib/security/html':\n${definitions.join('\n')}`).toEqual([])

    // Ruční řetězec `.replace(/&/g, '&amp;')…` je přesně ta nedokončená kopie, která neescapovala uvozovky.
    const handRolled = hits(/\.replace\(\s*\/&\/g\s*,\s*['"]&amp;['"]\s*\)/, (f) => f !== 'lib/security/html.ts')
    expect(handRolled, handRolled.join('\n')).toEqual([])
  })

  it('odkaz do atributu href se v e-mailových šablonách nikdy nevkládá bez escapování', () => {
    // `href="${x}"` smí obsahovat jen výraz volající escapeHtml(...), safeUrl(...) nebo safeHttpUrl(...).
    const emailFiles = (f: string) => /(^|\/)(email|[a-z-]*-email)\.ts$|lib\/ws\/email\/|lib\/admin\/vizeon-mail\.ts$/.test(f)
    const unsafe = hits(/href="\$\{(?!\s*(escapeHtml|esc|safeUrl|safeHttpUrl)\()/, emailFiles)
    expect(unsafe, `Odkaz v href bez escapeHtml():\n${unsafe.join('\n')}`).toEqual([])
  })
})
