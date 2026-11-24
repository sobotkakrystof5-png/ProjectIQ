/**
 * Co smí do runtime logů (audit 2026-11-24, #29). Logy Vercelu čte víc lidí
 * a nástrojů než databázi a nemají retenci, kterou slibují právní texty —
 * proto do nich nepatří celé e-maily ani celé objekty chyb (ty nesou dotaz,
 * hodnoty parametrů nebo kus obsahu faktury).
 */

const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

/** `jana.novakova@example.cz` → `j***@example.cz`. Doména zůstává kvůli dohledání chyby poskytovatele. */
export function maskEmail(value: string): string {
  return value.replace(EMAIL_RE, '$1***@$2')
}

/**
 * Krátký popis chyby: název, kód (Postgres, Node, HTTP) a zpráva bez e-mailů,
 * nejvýš 200 znaků. Nikdy `detail`, `query`, `params` ani tělo odpovědi.
 */
export function errorSummary(err: unknown): string {
  if (!(err instanceof Error)) return typeof err === 'string' ? maskEmail(err).slice(0, 200) : 'neznámá chyba'
  const e = err as Error & { code?: unknown; status?: unknown; statusCode?: unknown }
  const code = [e.code, e.status, e.statusCode].find((v) => typeof v === 'string' || typeof v === 'number')
  const head = code !== undefined ? `${e.name} ${String(code)}` : e.name
  return `${head}: ${maskEmail(e.message)}`.slice(0, 200)
}
