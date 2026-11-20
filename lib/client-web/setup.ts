// Návod pro web klienta (KP17, R-129): proměnné prostředí a kód pro Next.js.
// Čisté funkce bez klíče — v textu je jen název proměnné, hodnotu doplní
// Kryštof do env serveru webu (nikdy NEXT_PUBLIC_, nikdy do repozitáře).

export function buildWebEnvBlock(baseUrl: string): string {
  return [
    `ZAKAZIQ_URL=${baseUrl.replace(/\/+$/, '')}`,
    'ZAKAZIQ_WEB_KEY=   # klíč z adminu ZakazIQ, ukazuje se jen jednou; jen na serveru, ne NEXT_PUBLIC_',
  ].join('\n')
}

/** Soubor do webu klienta, volá se ze serverové akce po odeslání formuláře. */
export function buildWebSnippet(): string {
  return [
    "// lib/zakaziq.ts — jen na serveru (serverová akce nebo route handler)",
    "import 'server-only'",
    '',
    "export async function zakaziqUdalost(druh: 'poptavka' | 'objednavka'): Promise<void> {",
    '  const key = process.env.ZAKAZIQ_WEB_KEY',
    '  if (!key) return',
    '  try {',
    "    await fetch(`${process.env.ZAKAZIQ_URL ?? 'https://www.zakaziq.cz'}/api/public/web-udalost`, {",
    "      method: 'POST',",
    "      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },",
    '      body: JSON.stringify({ druh }),',
    "      cache: 'no-store',",
    '      signal: AbortSignal.timeout(2000),',
    '    })',
    '  } catch {',
    '    // Počítadlo nikdy nesmí zastavit odeslání formuláře.',
    '  }',
    '}',
    '',
    '// Ve serverové akci formuláře, až když se poptávka opravdu odeslala:',
    "//   import { after } from 'next/server'",
    "//   after(() => zakaziqUdalost('poptavka'))",
  ].join('\n')
}

/** Zkušební událost z terminálu — do čísel se nepočítá, jen potvrdí napojení. */
export function buildWebTestCommand(baseUrl: string): string {
  return [
    `curl -sS -X POST ${baseUrl.replace(/\/+$/, '')}/api/public/web-udalost \\`,
    '  -H "authorization: Bearer $ZAKAZIQ_WEB_KEY" \\',
    '  -H "content-type: application/json" \\',
    `  -d '{"druh":"poptavka","test":true}'`,
  ].join('\n')
}
