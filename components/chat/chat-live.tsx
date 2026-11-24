'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Živé obnovení chatu (KP15, vzor R-044): každých 10 s, jen když je karta
 * vidět, se zeptá na otisk s If-None-Match. Beze změny 304, se změnou si
 * stránka načte nová data. Otevřené vlákno zároveň zapíše návštěvu a — když
 * je karta vidět — přečteno. Počet nepřečtených jde do titulku karty.
 */
export function ChatLive({
  stateUrl,
  projectId,
  touch,
  unread,
}: {
  stateUrl: string
  projectId?: string
  touch?: (projectId: string, read: boolean) => Promise<void>
  unread: number
}) {
  const router = useRouter()
  const etag = useRef<string | null>(null)
  // Vlastní „přečteno" otisk nemění (audit 2026-11-24, #11), takže odznaky
  // nepřečtených po otevření vlákna obnoví jedno obnovení stránky — jednou na vlákno.
  const unreadRef = useRef(unread)
  const refreshedFor = useRef<string | null>(null)

  useEffect(() => {
    unreadRef.current = unread
    const base = document.title.replace(/^\(\d+\+?\)\s/, '')
    document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base
    return () => {
      document.title = base
    }
  }, [unread])

  useEffect(() => {
    let stopped = false
    const visible = () => document.visibilityState === 'visible'

    async function tick() {
      if (stopped || !visible()) return
      if (projectId && touch) {
        const read = await touch(projectId, true).then(() => true, () => false)
        if (read && unreadRef.current > 0 && refreshedFor.current !== projectId) {
          refreshedFor.current = projectId
          router.refresh()
        }
      }
      try {
        const res = await fetch(stateUrl, {
          headers: etag.current ? { 'If-None-Match': etag.current } : {},
          cache: 'no-store',
        })
        const next = res.headers.get('etag')
        if (res.status === 200 && next) {
          const changed = etag.current !== null && etag.current !== next
          etag.current = next
          if (changed) router.refresh()
        }
      } catch {
        // Bez sítě se zkusí za 10 s znovu.
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), 10_000)
    const onVisible = () => { if (visible()) void tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [stateUrl, projectId, touch, router])

  return null
}
