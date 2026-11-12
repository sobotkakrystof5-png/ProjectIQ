'use client'

import { useEffect, useState } from 'react'
import { LazyMotion } from 'framer-motion'
import { PortalContainerProvider } from '@/components/ui/portal'
import { setToastApp } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/**
 * Kořen admin konzole podle components/ws/ws-root.tsx (AD04, R-081): `data-app="admin"`
 * zapne přepisy z app/admin-tokens.css a dialogy, menu a tooltipy z components/ui/*
 * se vykreslují dovnitř. Bez toho by je Radix portáloval do <body>, kde přepisy
 * nejsou, a vypadaly by jako shadcn výchozí šeď.
 *
 * Admin nemá tmavý režim ani režim soukromí, proto je proti WsRoot o dost kratší.
 *
 * `LazyMotion` jako ve `WsRoot` (AD08): admin animuje přes `m` a vlastní
 * balíček Framer Motion (~26 kB gzip) se stáhne až s první animací. Měřeno:
 * Hovory −25,7 kB a Kalendář −28,9 kB upfront, ostatní obrazovky +0,4 kB
 * za samotnou `LazyMotion`.
 */
const loadMotionFeatures = () => import('@/lib/admin/motion-features').then((mod) => mod.default)
export function AdminRoot({ className, children }: { className?: string; children: React.ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    setToastApp('admin')
    return () => setToastApp('ws')
  }, [])

  return (
    <div ref={setContainer} data-app="admin" className={cn('min-h-screen bg-background', className)}>
      <LazyMotion features={loadMotionFeatures}>
        <PortalContainerProvider value={container}>{children}</PortalContainerProvider>
      </LazyMotion>
    </div>
  )
}
