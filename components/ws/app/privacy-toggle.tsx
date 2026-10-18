'use client'

import { useTransition } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { useWsPrivacy } from '@/components/ws/ws-root'
import { cn } from '@/lib/ws/utils'

export function PrivacyToggle() {
  const { enabled, setEnabled } = useWsPrivacy()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? 'Zobrazit částky a jména' : 'Skrýt částky a jména'}
      title={enabled ? 'Zobrazit částky a jména' : 'Skrýt částky a jména'}
      disabled={pending}
      onClick={() => startTransition(async () => {
        const result = await setEnabled(!enabled)
        if (!result.ok) toast.error(result.error)
      })}
      className={cn('inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-navy-50 hover:text-ink dark:hover:bg-navy-800', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60')}
    >
      {enabled ? <EyeOff aria-hidden size={20} strokeWidth={1.5} /> : <Eye aria-hidden size={20} strokeWidth={1.5} />}
    </button>
  )
}
