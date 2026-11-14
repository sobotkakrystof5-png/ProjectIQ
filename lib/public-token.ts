/**
 * Tokeny veřejných odkazů adminu: portál klienta `/p/[token]` (`projects.public_token`)
 * a dotazník `/h/[token]` (`projects.survey_token`).
 *
 * Oba sloupce jsou v databázi typu `uuid`. Dotaz s čímkoli jiným spadne na
 * Postgres `22P02` (invalid_text_representation), takže nesmyslný token vracel
 * 500 místo 404 — nezachycená chyba na veřejné routě, kterou umí vyvolat kdokoli.
 * Tvar se proto ověří, než se hodnota dostane do dotazu (AGENTS.md → B13:
 * každý vstup validovat na serveru).
 *
 * Stejný tvar hlídá Workspace v `resolvePortal()` a `/api/public/portal/[token]/transcribe`.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `null` = token nemá tvar UUID, do dotazu nepatří. Jinak malými písmeny. */
export function publicToken(token: unknown): string | null {
  return typeof token === 'string' && UUID.test(token) ? token.toLowerCase() : null
}
