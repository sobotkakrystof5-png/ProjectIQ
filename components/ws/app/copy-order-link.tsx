'use client'

import { Link2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

/** Zkopíruje odkaz na objednávací stránku byznysu (/r/[slug]). */
export async function copyOrderLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Odkaz zkopírovaný', { description: 'Vložte ho na web, do Instagramu nebo do zprávy.' })
    return true
  } catch {
    toast.error('Odkaz se nepodařilo zkopírovat', { description: url })
    return false
  }
}

export function CopyOrderLinkButton({
  url,
  label = 'Zkopírovat odkaz na objednání',
  onCopied,
  ...props
}: { url: string; label?: string; onCopied?: () => void } & Omit<ButtonProps, 'onClick'>) {
  return (
    <Button onClick={() => void copyOrderLink(url).then((copied) => { if (copied) onCopied?.() })} {...props}>
      <Link2 aria-hidden size={18} strokeWidth={1.5} />
      {label}
    </Button>
  )
}
