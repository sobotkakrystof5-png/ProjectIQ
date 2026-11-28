/**
 * Pojistky proti SQL injection (DECISIONS #062).
 *
 * Hodnota od uživatele jde do databáze **vždy jako parametr** — tagovanou
 * šablonou (`sql\`…\``, `q\`…\``, `adminDb\`…\``) nebo jako `$1` v `{ text, params }`.
 * Do textu dotazu se smí skládat jen kód: konstanty, sloupce z whitelistu
 * (`lib/admin-table.ts`) a čísla `$n`. Hlídá to `__tests__/sql-guard.test.ts`.
 *
 * Tenhle soubor řeší dvě věci, které parametr sám nevyřeší:
 * - `LIKE`/`ILIKE`: v parametru jsou `%` a `_` pořád zástupné znaky. Hledání
 *   „%" by vrátilo všechno a „_%_%_%…" by donutilo databázi k drahému
 *   porovnávání. Proto se escapují (výchozí escape znak Postgresu je `\`).
 * - Výběr podle klíče z adresy: `Object.hasOwn`, ať `__proto__` nebo
 *   `constructor` nevyberou něco, co ve whitelistu není.
 */

/** Nejdelší hledaný text. Delší se ořízne — hledání není místo na odstavec. */
export const LIKE_MAX = 200

/** Escapuje `\`, `%` a `_`, aby v LIKE platily jako obyčejné znaky. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * `%text%` pro `ILIKE … `: hledá text kdekoli, zástupné znaky z hledání
 * neplatí. `ESCAPE '\'` v dotazu psát nemusíte (je výchozí), ale můžete.
 */
export function likeContains(text: string, max = LIKE_MAX): string {
  return `%${escapeLike(text.slice(0, max))}%`
}

/** `text%` — začíná na. */
export function likePrefix(text: string, max = LIKE_MAX): string {
  return `${escapeLike(text.slice(0, max))}%`
}

/**
 * Hodnota z whitelistu podle klíče z adresy nebo formuláře. Neznámý klíč
 * (i `__proto__`, `toString`…) vrátí výchozí hodnotu, nikdy nic zděděného.
 */
export function pickAllowed<T>(allowed: Readonly<Record<string, T>>, key: unknown, fallback: string): T {
  if (typeof key === 'string' && Object.hasOwn(allowed, key)) return allowed[key] as T
  if (!Object.hasOwn(allowed, fallback)) throw new Error(`pickAllowed: výchozí klíč ${fallback} ve whitelistu není`)
  return allowed[fallback] as T
}

/**
 * Identifikátor (název role, tabulky) do DDL, kde parametr nejde. Jen malá
 * písmena, číslice a podtržítko — nic, co by šlo uvozovkami „utéct".
 */
export function assertSqlIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error('Neplatný identifikátor SQL.')
  return name
}
