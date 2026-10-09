'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/**
 * Pravý panel s detailem (B9). Otevřený je, dokud je v URL `?detail=…`;
 * zavření odebere parametr, tlačítko Zpět v prohlížeči ho zavře taky.
 * Na telefonu přes celou obrazovku (Sheet má w-full pod sm).
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
  const [open, setOpen] = useState(true)
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return
        setOpen(false)
        router.push(closeHref, { scroll: false })
      }}
    >
      <SheetContent side="right" className="overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">Detail</SheetDescription>}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
