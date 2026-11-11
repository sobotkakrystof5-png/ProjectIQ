'use client'

import { useEffect, useState } from 'react'
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
 */
export function AdminRoot({ className, children }: { className?: string; children: React.ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    setToastApp('admin')
    return () => setToastApp('ws')
  }, [])

  return (
    <div ref={setContainer} data-app="admin" className={cn('min-h-screen bg-background', className)}>
      <PortalContainerProvider value={container}>{children}</PortalContainerProvider>
    </div>
  )
}
