import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { escapeLike, likeContains, likePrefix, pickAllowed, assertSqlIdentifier } from '@/lib/security/sql'

// Strážce proti SQL injection (DECISIONS #062). Stejný nápad jako `xss-guard`:
// nehledá chybu v chování, ale konstrukce ve zdrojáku, kterými by se hodnota
// od uživatele dostala do textu dotazu místo do parametru.
//
// Co se smí do textu dotazu vložit přes `${…}` (mimo tagovanou šablonu):
// - konstanta (VELKÁ_PÍSMENA), číslo nebo počet parametrů (`params.length + 1`),
// - podmínka, která vybírá mezi dvěma doslovnými řetězci,
// - volání pomocné funkce jen s doslovnými argumenty (`family('p.contact_id')`),
// - nic jiného, pokud to není v REVIEWED níž. Každý řádek REVIEWED někdo četl:
//   hodnota je složená jen z kódu (konstanty, whitelist, `$n`), ne ze vstupu.
// Nový řádek = přečíst, odkud hodnota jde, a zapsat ho sem i s tím, proč je bezpečný.

const ROOT = process.cwd()
const SCAN = ['app', 'components', 'lib', 'proxy.ts']

function walk(entry: string, out: string[] = []): string[] {
  const full = path.join(ROOT, entry)
  let children: import('node:fs').Dirent[]
  try {
    children = readdirSync(full, { withFileTypes: true })
  } catch {
    if (/\.(ts|tsx)$/.test(entry)) out.push(entry)
    return out
  }
  for (const child of children) {
    if (child.name === 'node_modules' || child.name === '.next' || child.name === '__tests__') continue
    const rel = path.join(entry, child.name)
    if (child.isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(child.name) && !/\.test\.tsx?$/.test(child.name)) out.push(rel)
  }
  return out
}

const FILES = SCAN.flatMap((entry) => walk(entry)).map((file) => {
  const rel = file.split(path.sep).join('/')
  const source = readFileSync(path.join(ROOT, file), 'utf8')
  return { file: rel, sf: ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS) }
})

const SCRIPT_FILES = readdirSync(path.join(ROOT, 'scripts'))
  .filter((f) => /\.(m?js|ts)$/.test(f))
  .map((f) => ({ file: `scripts/${f}`, source: readFileSync(path.join(ROOT, 'scripts', f), 'utf8') }))

/** Text dotazu poznáme podle klíčových slov — `text:` se používá i v neSQL objektech. */
const SQL_WORDS = /\b(SELECT|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|WHERE|ORDER\s+BY|RETURNING|JOIN|GROUP\s+BY)\b|\b(LIMIT|OFFSET)\s+\$\d/i

const isLiteral = (n: ts.Node): boolean =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isNumericLiteral(n)

const SAFE_TEXT = [
  /^[A-Z][A-Z0-9_]*(\.[A-Za-z0-9_]+)*$/, // konstanta
  /^[A-Za-z_][\w.]*\.length( *[+-] *\d+)*$/, // počet parametrů → číslo $n
  /^(first|from) *[+-] *[\w.]+( *[+-] *\d+)*$/, // $n od daného místa
  /^\d+$/,
  // Fragmenty účetní knihy a faktur: objekty z `ledgerSql()` / `invoiceSql`, bez vstupu.
  /^(L|invoiceSql)\.\w+\(\)$/,
]

function isSafeExpression(e: ts.Expression, sf: ts.SourceFile): boolean {
  const text = e.getText(sf).replace(/\s+/g, ' ')
  if (SAFE_TEXT.some((r) => r.test(text))) return true
  if (ts.isParenthesizedExpression(e)) return isSafeExpression(e.expression, sf)
  if (ts.isConditionalExpression(e)) {
    return [e.whenTrue, e.whenFalse].every(
      (b) => isLiteral(b) || (ts.isTemplateExpression(b) && b.templateSpans.every((s) => isSafeExpression(s.expression, sf))),
    )
  }
  // Pomocná funkce s doslovnými argumenty skládá fragment z kódu, ne ze vstupu.
  if (ts.isCallExpression(e) && e.arguments.length > 0 && e.arguments.every(isLiteral)) return true
  return false
}

type Finding = { file: string; line: number; expr: string }

/** Šablony, které se opravdu spouštějí: argument `.query(…)` a `text:` vedle `params`. */
function executedSqlInterpolations(): Finding[] {
  const out: Finding[] = []
  for (const { file, sf } of FILES) {
    const report = (node: ts.Node) => {
      if (!ts.isTemplateExpression(node) || !SQL_WORDS.test(node.getText(sf))) return
      for (const span of node.templateSpans) {
        if (isSafeExpression(span.expression, sf)) continue
        out.push({
          file,
          line: sf.getLineAndCharacterOfPosition(span.expression.getStart(sf)).line + 1,
          expr: span.expression.getText(sf).replace(/\s+/g, ' '),
        })
      }
    }
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'query' && node.arguments[0]) {
        report(node.arguments[0])
      }
      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(sf) === 'text' &&
        ts.isObjectLiteralExpression(node.parent) &&
        node.parent.properties.some((p) => p.name?.getText(sf) === 'params')
      ) {
        report(node.initializer)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}

/**
 * Přečtené fragmenty: soubor → výrazy. Odkud hodnota je, stojí u každého souboru.
 * Výraz se porovnává doslova (bez bílých znaků navíc).
 */
const REVIEWED: Record<string, string[]> = {
  // Sloupec a měna z `ledgerSql()` (has = existuje sloupec), jinak konstanty.
  'app/costs-actions.ts': ['lifecycle', 'lifecycleValues', 'maHistorii'],
  'app/dashboard/finance/business-income-actions.ts': ['originCol', 'originVal'],
  // Výpisy adminu: `params.orderBy` je z whitelistu v `parseTableParams` (Object.hasOwn),
  // `where`/`filter.sql` skládají konstanty a `$n`, hodnoty jdou do `params`.
  'lib/admin/contacts.ts': ['where', 'filter.sql', 'params.orderBy', 'countFilter.sql', 'family'],
  'lib/admin/costs.ts': ['where(L, kind)', 'params.orderBy'],
  'lib/admin/invoices.ts': ['invoiceColumns(L)', 'base', 'filter.sql', 'params.orderBy'],
  'lib/admin/leads.ts': ['params.orderBy'],
  'lib/admin/projects.ts': ['filter.sql', 'params.orderBy', 'originOnly.sql', 'scopeOnly.sql'],
  'lib/admin/waitlist.ts': ['filter', 'params.orderBy'],
  'lib/ws/admin/clients.ts': ['params.orderBy'],
  // `invoiceColumns(L)` = sloupce podle `ledgerSql()`; L je objekt z kódu, ne vstup.
  'app/dashboard/finance/invoice-actions.ts': ['invoiceColumns(L)'],
  // Tabulka a podmínka z konstanty BILLING_TARGETS, klíč a sloupec z pevného seznamu polí.
  'lib/admin/contact-sync.ts': ['table', 'key', 'where', 'col', "same(col, '$3::text')", "same(`coalesce(${col}, '')`, '$2::text')", 'meetingPhone'],
  'lib/admin/agent-leads.ts': ['open'],
  'lib/admin/memory/facts.ts': ['projectIds', 'recent'],
  // `where` je vždy doslovný řetězec ve volání (`selectRows('WHERE id = $1', …)`).
  'lib/admin/offers/research.ts': ['where'],
  'lib/admin/offers/proposals.ts': ['where'],
  // `BUCKET(now)` je tagovaná šablona (text s $n, hodnoty v params); shift jen přečísluje $n.
  'lib/ws/calendar.ts': ['shift(bucket.text, 3)', 'shift(bucket.text, 2)'],
  'lib/admin/voice/manage.ts': ['w.sql'],
  'lib/admin/voice/meetings.ts': ['where'],
  'lib/admin/voice/queries.ts': ['aggregates', 'where.sql'],
  // Filtr z FILTER_WHERE přes `parseContactFilter` (jen známé klíče), hledání jako `$n`.
  'lib/admin/outreach-crm.ts': ['FILTER_WHERE[filter]', 'searchSql', 'countSql'],
  'lib/admin/outreach.ts': ['v2 ? RECORD_COLUMNS_V2 : RECORD_COLUMNS'],
  'lib/invoices.ts': ['currencyMatch'],
  'lib/web-leads.ts': ['filter'],
}

describe('sql-guard', () => {
  it('prohledává smysluplný počet souborů', () => {
    expect(FILES.length).toBeGreaterThan(300)
  })

  it('žádné .unsafe() — syrové SQL z řetězce nikde', () => {
    const found = [...FILES.map(({ file, sf }) => ({ file, source: sf.text })), ...SCRIPT_FILES]
      .flatMap(({ file, source }) =>
        source.split('\n').flatMap((line, i) => (/\.unsafe\s*\(/.test(line) && !/^\s*(\/\/|\*)/.test(line) ? [`${file}:${i + 1}  ${line.trim()}`] : [])),
      )
    expect(found, found.join('\n')).toEqual([])
  })

  it('sql() se nevolá jako obyčejná funkce s textem (jen jako tagovaná šablona)', () => {
    const found: string[] = []
    for (const { file, sf } of FILES) {
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          /^(sql|wsql|q)$/.test(node.expression.text) &&
          node.arguments[0] &&
          (ts.isStringLiteral(node.arguments[0]) || ts.isTemplateExpression(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
        ) {
          found.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
    expect(found, found.join('\n')).toEqual([])
  })

  it('do textu spouštěného dotazu jde jen kód, ne hodnota (nové místo = přečíst a zapsat do REVIEWED)', () => {
    const findings = executedSqlInterpolations()
    const unreviewed = findings.filter((f) => !(REVIEWED[f.file] ?? []).includes(f.expr))
    expect(
      unreviewed.map((f) => `${f.file}:${f.line}  \${${f.expr}}`),
      'Hodnotu předejte parametrem ($1 + params), nebo ověřte, že je složená jen z kódu, a zapište ji do REVIEWED s důvodem.',
    ).toEqual([])
  })

  it('REVIEWED neobsahuje mrtvé řádky (seznam se drží krátký a pravdivý)', () => {
    const findings = executedSqlInterpolations()
    const stale = Object.entries(REVIEWED).flatMap(([file, exprs]) =>
      exprs.filter((expr) => !findings.some((f) => f.file === file && f.expr === expr)).map((expr) => `${file}  ${expr}`),
    )
    expect(stale, 'Výraz už v kódu není — smažte ho z REVIEWED.').toEqual([])
  })

  it('vzor pro LIKE se neskládá ručně (`%${…}%`) — jen likeContains()', () => {
    const found: string[] = []
    for (const { file, sf } of FILES) {
      if (file === 'lib/security/sql.ts') continue
      const visit = (node: ts.Node) => {
        if (ts.isTemplateExpression(node)) {
          // Výraz přímo mezi `%` a `%` je hodnota pro LIKE; konstanta (značka ukázkových dat) smí.
          const literals = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
          node.templateSpans.forEach((span, i) => {
            const before = literals[i]!
            const after = literals[i + 1]!
            const expr = span.expression.getText(sf)
            if (before.endsWith('%') && (after.startsWith('%') || after === '') && !SAFE_TEXT[0]!.test(expr)) {
              found.push(`${file}:${sf.getLineAndCharacterOfPosition(span.expression.getStart(sf)).line + 1}  %\${${expr}}%`)
            }
          })
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
    expect(found, found.join('\n')).toEqual([])
  })

  it('skripty: do .query() s ${…} jen heslo role, které má ověřený tvar', () => {
    const found = SCRIPT_FILES.flatMap(({ file, source }) =>
      source.split('\n').flatMap((line, i) => {
        if (!/\.query\(\s*`[^`]*\$\{/.test(line)) return []
        if (/(ws|portal)-create-role\.js$/.test(file) && /PASSWORD '\$\{password\}'/.test(line)) return []
        return [`${file}:${i + 1}  ${line.trim()}`]
      }),
    )
    expect(found, found.join('\n')).toEqual([])
    // Heslo do DDL hlídá tvar přímo ve skriptu.
    for (const name of ['ws-create-role.js', 'portal-create-role.js']) {
      const source = SCRIPT_FILES.find((s) => s.file === `scripts/${name}`)?.source ?? ''
      expect(source, name).toMatch(/\[A-Za-z0-9_-\]\{43\}/)
    }
  })
})

describe('lib/security/sql', () => {
  it('escapeLike: %, _ a \\ jsou obyčejné znaky', () => {
    expect(escapeLike('100%')).toBe('100\\%')
    expect(escapeLike('a_b')).toBe('a\\_b')
    expect(escapeLike('c:\\cesta')).toBe('c:\\\\cesta')
    expect(escapeLike("O'Brien")).toBe("O'Brien")
  })

  it('likeContains a likePrefix obalí a ořízne', () => {
    expect(likeContains('Novák')).toBe('%Novák%')
    expect(likeContains('%_%')).toBe('%\\%\\_\\%%')
    expect(likePrefix('ab%')).toBe('ab\\%%')
    expect(likeContains('x'.repeat(500)).length).toBe(202)
  })

  it('pickAllowed nevrátí nic zděděného', () => {
    const allowed = { jmeno: 'name', email: 'email' }
    expect(pickAllowed(allowed, 'email', 'jmeno')).toBe('email')
    expect(pickAllowed(allowed, '__proto__', 'jmeno')).toBe('name')
    expect(pickAllowed(allowed, 'toString', 'jmeno')).toBe('name')
    expect(pickAllowed(allowed, ['email'], 'jmeno')).toBe('name')
    expect(() => pickAllowed(allowed, 'x', 'neni')).toThrow()
  })

  it('assertSqlIdentifier pustí jen bezpečný identifikátor', () => {
    expect(assertSqlIdentifier('ws_app')).toBe('ws_app')
    expect(() => assertSqlIdentifier('ws_app; DROP TABLE x')).toThrow()
    expect(() => assertSqlIdentifier('"x"')).toThrow()
    expect(() => assertSqlIdentifier('Role')).toThrow()
  })
})

describe('LIKE se zástupnými znaky v databázi', () => {
  it('hledání „%" nenajde všechno (PGlite)', async () => {
    const { PGlite } = await import('@electric-sql/pglite')
    const db = new PGlite()
    await db.exec(`CREATE TABLE t (name text); INSERT INTO t VALUES ('Novák'), ('100% spokojenost'), ('a_b'), ('axb');`)
    const count = async (p: string) => (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM t WHERE name ILIKE $1', [p])).rows[0]!.n
    expect(await count('%%%')).toBe(4) // bez escapování: všechno
    expect(await count(likeContains('%'))).toBe(1)
    expect(await count(likeContains('_'))).toBe(1)
    expect(await count(likeContains('novák'))).toBe(1)
    // Pokus o „útěk" z literálu je v parametru jen text.
    expect(await count(likeContains("' OR '1'='1"))).toBe(0)
    await db.close()
  })
})
