'use client'

import { useEffect, useRef, useState } from 'react'
import { MAX_PDF_BYTES, MAX_PDF_LABEL } from '@/lib/invoice-constants'

/**
 * Přetažení PDF faktury odkudkoliv (Finder, příloha mailu, stažené soubory)
 * na libovolnou plochu, která tenhle hook použije.
 *
 * Validuje se tu jen to, co by uživatele zbytečně poslalo na server a zpátky —
 * typ a velikost. Skutečnou kontrolu („je to fakt PDF podle hlavičky bajtů")
 * dělá `readPdfUpload` na serveru, tady jde čistě o rychlou zpětnou vazbu.
 */

/** Nese tažení opravdu soubor? Tažený text nebo odkaz z prohlížeče ne. */
function carriesFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false
  return Array.from(dt.types).includes('Files')
}

export function readDroppedPdf(dt: DataTransfer | null): { file: File } | { error: string } {
  const file = dt?.files?.[0] ?? null
  if (!file) return { error: 'Přetáhni soubor s fakturou v PDF' }

  // Některé zdroje (příloha mailu, archiv) pošlou prázdný MIME typ — pak
  // rozhodne přípona, ať uživatel nemusí soubor nejdřív někam ukládat.
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return { error: 'Přijímám jen PDF faktury' }
  if (file.size > MAX_PDF_BYTES) return { error: `PDF je příliš velké — maximum je ${MAX_PDF_LABEL}` }

  return { file }
}

export function usePdfDrop({
  onFile,
  onReject,
  disabled,
}: {
  onFile: (file: File) => void
  /** Zamítnuté tažení — volající rozhodne, jestli toast, nebo hláška u pole */
  onReject?: (message: string) => void
  disabled?: boolean
}) {
  const [isOver, setIsOver] = useState(false)

  // Minutí plochy nesmí shodit rozdělanou práci: bez tohohle by prohlížeč
  // přetažené PDF otevřel místo appky a formulář by zmizel i s vyplněnými
  // poli. Jediný file input v appce je schovaný uvnitř `InvoiceFields`,
  // takže se tím žádné nativní nahrávání nerozbije.
  useEffect(() => {
    const swallow = (e: DragEvent) => {
      if (carriesFiles(e.dataTransfer)) e.preventDefault()
    }
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  // dragenter/dragleave bublá i z potomků — bez počítadla by zvýraznění
  // problikávalo pokaždé, když kurzor přejede přes vnitřní prvek.
  const depth = useRef(0)

  function reset() {
    depth.current = 0
    setIsOver(false)
  }

  const dropProps = {
    onDragEnter(e: React.DragEvent) {
      if (disabled || !carriesFiles(e.dataTransfer)) return
      e.preventDefault()
      depth.current += 1
      setIsOver(true)
    },
    onDragOver(e: React.DragEvent) {
      if (disabled || !carriesFiles(e.dataTransfer)) return
      // Bez preventDefault prohlížeč soubor otevře místo předání appce.
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave(e: React.DragEvent) {
      if (disabled || !carriesFiles(e.dataTransfer)) return
      e.preventDefault()
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setIsOver(false)
    },
    onDrop(e: React.DragEvent) {
      if (disabled || !carriesFiles(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      reset()

      const result = readDroppedPdf(e.dataTransfer)
      if ('error' in result) {
        onReject?.(result.error)
        return
      }
      onFile(result.file)
    },
  }

  return { isOver, dropProps }
}
