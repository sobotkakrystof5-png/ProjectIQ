'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

/** Prompt pro Claude Code: náhled a jedno tlačítko „Zkopírovat". */
export function CopyPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      toast.success('Prompt je ve schránce. Vložte ho do Claude Code v repu autopilota.')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Kopírování se nepovedlo. Označte text a zkopírujte ho ručně.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-quiet">
          Otevřete Claude Code ve složce vizeon-autopilot a vložte. Nejdřív navrhne, implementuje až po vašem souhlasu.
        </p>
        <Button type="button" onClick={copy}>
          {copied ? (
            <Check size={16} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Copy size={16} strokeWidth={1.5} aria-hidden="true" />
          )}
          {copied ? 'Zkopírováno' : 'Zkopírovat prompt'}
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-chip border border-navy-100 bg-navy-50 p-4 font-num text-xs leading-relaxed text-ink">
        {prompt}
      </pre>
    </div>
  )
}
