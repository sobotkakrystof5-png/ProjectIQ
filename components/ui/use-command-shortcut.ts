'use client'

import * as React from 'react'

/**
 * Otevře/zavře paletu na ⌘K (Mac) i Ctrl+K (Windows). Zvlášť od palety
 * (`command.tsx` importuje cmdk), aby kostra aplikace nestahovala cmdk
 * jen kvůli zkratce (RD03).
 */
export function useCommandShortcut(setOpen: React.Dispatch<React.SetStateAction<boolean>>) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setOpen])
}
