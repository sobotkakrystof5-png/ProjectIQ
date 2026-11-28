import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Strážce proti prompt injection (DECISIONS #062). Stejný nápad jako `xss-guard`
// a `sql-guard`: hlídá zdroják, aby nové volání modelu nevzniklo bez ochrany
// cizího textu a aby se do rámce `<značka>…</značka>` nevložila hodnota,
// kterou nikdo nevyčistil (`lib/ai/untrusted.ts`).

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
  return { file: rel, source: readFileSync(path.join(ROOT, file), 'utf8') }
})

/** Soubor volá jazykový model (Anthropic SDK nebo chatové API). Přepis zvuku sem nepatří. */
const CALLS_MODEL = /messages\.(create|parse|stream)\(|api\.anthropic\.com\/v1\/messages|api\.openai\.com\/v1\/(chat|responses)/
// Import modulu, nebo použití funkce, která přes něj čistí (`escapeTranscript`, `escapeClientText`).
const USES_GUARD = /from '@\/lib\/ai\/(untrusted|markers)'|\b(cleanForPrompt|stripMarkers|frame|escapeTranscript|escapeClientText)\(/

/** Volání modelu bez sdíleného modulu — každé s důvodem. Nové = nové rozhodnutí. */
const MODEL_EXEMPT: Record<string, string> = {
  // Diktát je řeč samotného Kryštofa; přepis má vlastní rámec a výstup hlídají pojistky G6–G9 (R-150).
  'lib/admin/voice/cleanup.ts': 'vlastní pojistky G6–G9',
  // Vstup jsou opravy, které v aplikacích udělal Kryštof sám; výstup jsou jen návrhy ke schválení.
  'lib/admin/voice/learner.ts': 'vlastní opravy, návrhy ke schválení',
}

/** Dokument (PDF) jde modelu jako blok, ne text: pravidlo o nedůvěryhodném vstupu musí být v systémovém promptu. */
const DOCUMENT_READERS = ['lib/invoice-ai.ts', 'lib/ws/money/ai.ts']

/**
 * Hodnoty vložené do rámce `<značka>\n${…}`, které jsou vyčištěné jinde (po
 * položkách přes `stripMarkers`) nebo jsou celé z našeho kódu. Výraz
 * s čisticí funkcí (`stripMarkers(…)`, `cleanForPrompt(…)`, `escapeClientText(…)`,
 * `escapeTranscript(…)`) nebo konstanta sem psát nemusí.
 */
const REVIEWED_FRAMES: Record<string, string[]> = {
  // Každá hodnota prošla `clean()` → stripMarkers.
  'lib/admin/assistant-lookups.ts': ["parts.join('\\n\\n')"],
  'lib/ai/context.ts': ['body'],
  // Řádky aktivity prošly stripMarkers (a se známkami pokynu se vynechaly).
  'lib/admin/memory/drafts.ts': ['text'],
  // Každý řádek paměti prošel stripMarkers.
  'lib/admin/memory/store.ts': ["lines.join('\\n')"],
  // Hodnoty faktů prošly stripMarkers, zbytek jsou čísla a data z SQL.
  'lib/admin/memory/facts.ts': ['JSON.stringify(data)'],
  // Věta už prošla stripMarkers(redactSensitive(…)) v proposeAction.
  'lib/ai/propose.ts': ['text'],
  // Přepis vlastního diktátu: vlastní čištění rámce (MODEL_EXEMPT).
  'lib/admin/voice/cleanup.ts': ['safe'],
  // Opravy z vlastních aplikací, JSON.stringify s oříznutím (MODEL_EXEMPT).
  'lib/admin/voice/learner.ts': ["log .map((r) => JSON.stringify({ id: r.id, prepis: clip(r.raw_text), vlozeno: clip(r.final_text), opraveno: clip(r.edited_text) })) .join('\\n')"],
}

const HTML_TAGS = new Set(['p', 'div', 'ul', 'ol', 'li', 'tr', 'td', 'th', 'table', 'tbody', 'strong', 'span', 'a', 'b', 'i', 'pre', 'code', 'html', 'body', 'head'])
const CLEANING_CALL = /^(stripMarkers|cleanForPrompt|escapeClientText|escapeTranscript|frame)\(/
const CONSTANT = /^[A-Z][A-Z0-9_]*$/

type Framed = { file: string; line: number; tag: string; expr: string }

function framedInterpolations(): Framed[] {
  const out: Framed[] = []
  for (const { file, source } of FILES) {
    if (!/<[a-z_]+[^<>]*>\\n\$\{|<[a-z_]+[^<>]*>\n\$\{/.test(source)) continue
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
      if (ts.isTemplateExpression(node)) {
        const literals = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
        node.templateSpans.forEach((span, i) => {
          const before = literals[i]!
          // Rámec pro model = značka a hned nový řádek; HTML v e-mailech (`<p>${…}`) sem nepatří.
          const open = /<([a-z_]+)(?:\s[^<>]*)?>\n$/.exec(before)
          if (!open || HTML_TAGS.has(open[1]!)) return
          out.push({
            file,
            line: sf.getLineAndCharacterOfPosition(span.expression.getStart(sf)).line + 1,
            tag: open[1]!,
            expr: span.expression.getText(sf).replace(/\s+/g, ' '),
          })
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}

describe('prompt-guard', () => {
  it('prohledává smysluplný počet souborů', () => {
    expect(FILES.length).toBeGreaterThan(300)
  })

  it('každý soubor, který volá model, čistí cizí text přes lib/ai/untrusted (přímo nebo přes escapeTranscript/escapeClientText)', () => {
    const callers = FILES.filter(({ source }) => CALLS_MODEL.test(source)).map(({ file }) => file)
    expect(callers.length, 'Test nenašel žádné volání modelu — změnil se způsob volání?').toBeGreaterThan(5)
    const missing = FILES.filter(({ file, source }) => CALLS_MODEL.test(source) && !USES_GUARD.test(source) && !(file in MODEL_EXEMPT)).map(
      ({ file }) => file,
    )
    expect(missing, 'Cizí text pro model čistěte přes lib/ai/untrusted (cleanForPrompt, frame, stripMarkers).').toEqual([])
  })

  it('výjimky platí jen pro soubory, které model opravdu volají', () => {
    const stale = Object.keys(MODEL_EXEMPT).filter((file) => !FILES.some((f) => f.file === file && CALLS_MODEL.test(f.source)))
    expect(stale).toEqual([])
  })

  it('čtení PDF modelem má v systémovém promptu pravidlo o nedůvěryhodném dokumentu', () => {
    for (const file of DOCUMENT_READERS) {
      const source = FILES.find((f) => f.file === file)?.source ?? ''
      expect(source, file).toMatch(/nedůvěryhodn/)
    }
  })

  it('do rámce <značka> jde jen vyčištěná hodnota (nové místo = vyčistit, nebo přečíst a zapsat do REVIEWED_FRAMES)', () => {
    const unreviewed = framedInterpolations().filter(
      (f) => !CLEANING_CALL.test(f.expr) && !CONSTANT.test(f.expr) && !(REVIEWED_FRAMES[f.file] ?? []).includes(f.expr),
    )
    expect(unreviewed.map((f) => `${f.file}:${f.line}  <${f.tag}>\${${f.expr}}`)).toEqual([])
  })

  it('REVIEWED_FRAMES neobsahuje mrtvé řádky', () => {
    const found = framedInterpolations()
    const stale = Object.entries(REVIEWED_FRAMES).flatMap(([file, exprs]) =>
      exprs.filter((expr) => !found.some((f) => f.file === file && f.expr === expr)).map((expr) => `${file}  ${expr}`),
    )
    expect(stale).toEqual([])
  })

  it('systémový prompt ani zprávy pro model nejdou z těla požadavku', () => {
    // Díra z AD14: route předávala `systemPrompt` a `messages` z prohlížeče. Ať se nevrátí.
    const found = FILES.filter(({ file }) => file.startsWith('app/')).flatMap(({ file, source }) =>
      source.split('\n').flatMap((line, i) => (/(body|json|input|data)\??\.(systemPrompt|system)\b/.test(line) ? [`${file}:${i + 1}  ${line.trim()}`] : [])),
    )
    expect(found).toEqual([])
  })
})
