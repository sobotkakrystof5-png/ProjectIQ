'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

// „Přidat na plochu“ (S18, PWA). Chrome a Android nabídnou instalaci samy
// (beforeinstallprompt), Safari na iPhonu to umí jen přes Sdílet, tak radí.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type State = 'unknown' | 'installed' | 'prompt' | 'ios' | 'other'

export function InstallApp() {
  const [state, setState] = useState<State>('unknown')
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
    if (standalone) {
      setState('installed')
      return
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setState(ios ? 'ios' : 'other')
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as InstallPrompt)
      setState('prompt')
    }
    const onInstalled = () => setState('installed')
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (state === 'unknown') return null
  if (state === 'installed') return <p className="text-[15px] text-quiet">ZakazIQ už máte na ploše.</p>
  if (state === 'prompt' && deferred) {
    return (
      <Button
        variant="outline"
        onClick={async () => {
          await deferred.prompt()
          const { outcome } = await deferred.userChoice
          setDeferred(null)
          setState(outcome === 'accepted' ? 'installed' : 'other')
        }}
      >
        Přidat na plochu
      </Button>
    )
  }
  if (state === 'ios') {
    return <p className="text-[15px] text-quiet">V Safari klepněte dole na Sdílet a vyberte Přidat na plochu.</p>
  }
  return <p className="text-[15px] text-quiet">V menu prohlížeče vyberte Přidat na plochu nebo Nainstalovat aplikaci.</p>
}
