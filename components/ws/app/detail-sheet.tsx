'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/ws/utils'

/** Od této šířky je detail zadokovaný vedle obsahu (pravidlo v app/ws-tokens.css). */
const DOCK_QUERY = '(min-width: 1280px)'

function useDocked(): boolean {
  // Portál se vykreslí až v prohlížeči, takže čtení matchMedia při prvním renderu nevadí hydrataci.
  const [docked, setDocked] = useState(() => typeof window !== 'undefined' && window.matchMedia(DOCK_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(DOCK_QUERY)
    const sync = () => setDocked(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return docked
}

/**
 * Pravý panel s detailem (B9). Otevřený je, dokud je v URL `?detail=…`;
 * zavření odebere parametr, tlačítko Zpět v prohlížeči ho zavře taky.
 * Na telefonu přes celou obrazovku (Sheet má w-full pod sm).
 * Od 1280 px je zadokovaný (R-057): bez ztmavení a zámku stránky, obsah se
 * vedle něj zúží, takže kalendář zůstane vidět a klik na jiný termín jen
 * přepne detail. Zavírá křížek nebo Esc.
 * Server ho vykresluje s `key` podle detailu, takže jiný detail = čerstvý stav.
 */
export function DetailSheet({
  title,
  description,
  closeHref,
  children,
}: {
  title: string
  description?: string
  closeHref: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const docked = useDocked()
  const [open, setOpen] = useState(true)
  return (
    <Sheet
      open={open}
      modal={!docked}
      onOpenChange={(next) => {
        if (next) return
        setOpen(false)
        router.push(closeHref, { scroll: false })
      }}
    >
      <SheetContent
        side="right"
        data-detail-docked={docked ? '' : undefined}
        // Zadokovaný panel nezavírá klik vedle — odkaz na jiný termín ho má jen přepnout.
        onInteractOutside={docked ? (e) => e.preventDefault() : undefined}
        className={cn('overflow-y-auto sm:max-w-[480px]', docked && 'shadow-none sm:rounded-l-none')}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">Detail</SheetDescription>}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
