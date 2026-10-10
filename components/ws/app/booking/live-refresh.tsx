'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const INTERVAL_MS = 10_000

/**
 * Živé obnovení (S10): každých 10 s se zeptá, jestli se v byznysu něco
 * změnilo (ETag + If-None-Match, odpověď bez dat). Při změně si stránka
 * načte data znovu, nová poptávka tak naskočí do 15 s. Skrytá karta se
 * neptá; po návratu na kartu se zeptá hned.
 */
export function LiveRefresh({ slug }: { slug: string }) {
  const router = useRouter()

  useEffect(() => {
    let etag: string | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const url = `/api/ws/${encodeURIComponent(slug)}/zmeny`

    const poll = async () => {
      if (timer) clearTimeout(timer)
      timer = null
      if (stopped || document.visibilityState !== 'visible') return
      try {
        const res = await fetch(url, {
          headers: etag ? { 'If-None-Match': etag } : {},
          cache: 'no-store',
          redirect: 'manual',
        })
        const next = res.status === 200 ? res.headers.get('etag') : null
        if (next) {
          if (etag && next !== etag) router.refresh()
          etag = next
        }
      } catch {
        // Bez sítě se zkusí znovu při dalším kole — nic se neztratí.
      }
      if (!stopped) timer = setTimeout(poll, INTERVAL_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    void poll()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [slug, router])

  return null
}
