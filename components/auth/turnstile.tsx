'use client'

import { useEffect, useRef } from 'react'

// Ochrana proti botům na přihlášení, registraci a obnově hesla (R-081):
// Cloudflare Turnstile. Token se posílá Supabase Auth (`captchaToken`), který
// ho ověří tajným klíčem — nastavuje se v Supabase → Authentication → Attack
// Protection. Bez NEXT_PUBLIC_TURNSTILE_SITE_KEY se nic nevykreslí a formuláře
// token nečekají (dev, náhledy).
//
// Režim „interaction-only“: většina lidí nic neuvidí, okénko se ukáže, jen
// když si Cloudflare není jistý. Skript vkládá náš (nonce) skript, takže ho
// CSP pustí přes strict-dynamic; rámeček povoluje frame-src (lib/security/csp.ts).

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loader: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    script.onerror = () => {
      loader = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(script)
  })
  return loader
}

/** Veřejný klíč Turnstile; prázdný = ochrana vypnutá. */
export const turnstileSiteKey = (): string => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

/** Hláška, když formulář čeká na token. */
export const CAPTCHA_PENDING = 'Ještě moment, ověřujeme, že nejste robot. Zkuste to prosím za pár vteřin.'

/**
 * Okénko Turnstile. `onToken` dostane token, nebo null (vypršel, chyba).
 * Každý token platí jen jednou: po odeslání formuláře zvyšte `resetKey`.
 */
export function Turnstile({
  onToken,
  resetKey,
  action,
}: {
  onToken: (token: string | null) => void
  resetKey: number
  /** Popisek v přehledu Cloudflare (např. „prihlaseni“). */
  action?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const callback = useRef(onToken)
  callback.current = onToken
  const siteKey = turnstileSiteKey()

  useEffect(() => {
    if (!siteKey || !box.current) return
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return
        widget.current = api.render(box.current, {
          sitekey: siteKey,
          action,
          language: 'cs',
          theme: 'auto',
          appearance: 'interaction-only',
          callback: (token: string) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        })
      })
      .catch(() => callback.current(null))
    return () => {
      cancelled = true
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
    }
  }, [siteKey, action])

  useEffect(() => {
    if (resetKey === 0 || !widget.current || !window.turnstile) return
    callback.current(null)
    window.turnstile.reset(widget.current)
  }, [resetKey])

  if (!siteKey) return null
  return <div ref={box} />
}
