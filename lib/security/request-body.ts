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
