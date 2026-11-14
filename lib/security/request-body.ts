/** Přečte request body jen do pevného limitu, včetně požadavků bez content-length. */
export async function readBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return { ok: false }

  const reader = request.body?.getReader()
  if (!reader) return { ok: true, bytes: new Uint8Array() }

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return { ok: false }
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, bytes }
}

/**
 * Tělo jako JSON s pevným stropem. `req.json()` přečte, co pošle klient — bez
 * stropu je veřejná routa cesta k vyčerpání paměti funkce. Workspace to má přes
 * `readJson()` v `lib/ws/intake/http.ts` (64 kB); tohle je totéž pro veřejná
 * API adminu, aby se limit nepsal na každé routě znovu.
 *
 * `'too-large'` = tělo přes limit (413), `'invalid'` = není to JSON (400).
 */
export async function readJsonLimited(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; reason: 'too-large' | 'invalid' }> {
  const bounded = await readBodyLimited(request, maxBytes)
  if (!bounded.ok) return { ok: false, reason: 'too-large' }
  try {
    return { ok: true, value: JSON.parse(Buffer.from(bounded.bytes).toString('utf8')) as unknown }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}
