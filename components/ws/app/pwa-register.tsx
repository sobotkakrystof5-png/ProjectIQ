'use client'

import { useEffect } from 'react'

/** Zaregistruje service worker PWA (public/sw.js, jen offline stránka). Ve vývoji ne. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/w' }).catch(() => {
      // bez service workeru aplikace funguje dál, jen bez offline stránky
    })
  }, [])
  return null
}
