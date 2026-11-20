'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Info } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/**
 * Panel „O zakázce" na užší obrazovce (KP16, R-123). Od 1280 px je panel
 * vedle chatu napevno; pod tím ho otevře tlačítko v záhlaví chatu — na
 * telefonu je tak všechno na dvě klepnutí. Obsah kreslí server (children).
 */
export function AsideSheet({ projectName, children }: { projectName: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const path = usePathname()
  // Odkaz uvnitř panelu vede jinam — panel se zavře sám.
  const [openedAt, setOpenedAt] = useState(path)
  if (open && path !== openedAt) {
    setOpen(false)
    setOpenedAt(path)
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setOpenedAt(path)
      }}
    >
      <SheetTrigger
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
        aria-label="O zakázce"
      >
        <Info size={20} strokeWidth={1.5} />
      </SheetTrigger>
      <SheetContent side="right" className="gap-0 overflow-y-auto p-0">
        <SheetTitle className="sr-only">O zakázce {projectName}</SheetTitle>
        <SheetDescription className="sr-only">Etapy, peníze, konzultace a co se dělo.</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  )
}
