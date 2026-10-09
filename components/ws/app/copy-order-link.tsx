'use client'

import { Link2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

/** Zkopíruje odkaz na objednávací stránku byznysu (/r/[slug]). */
export async function copyOrderLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Odkaz zkopírovaný', { description: 'Vložte ho na web, do Instagramu nebo do zprávy.' })
  } catch {
    toast.error('Odkaz se nepodařilo zkopírovat', { description: url })
  }
}

export function CopyOrderLinkButton({
  url,
  label = 'Zkopírovat odkaz na objednání',
  ...props
}: { url: string; label?: string } & Omit<ButtonProps, 'onClick'>) {
  return (
    <Button onClick={() => void copyOrderLink(url)} {...props}>
      <Link2 aria-hidden size={18} strokeWidth={1.5} />
      {label}
    </Button>
  )
}
