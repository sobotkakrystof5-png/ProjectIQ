'use client'

import { useTransition } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { runVoiceLearning } from '@/app/voice-actions'

/** „Spustit učení teď" (VO08): projde opravy hned, včetně rozboru AI. */
export function RunLearningButton() {
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await runVoiceLearning()
            if (!res.ok) return void toast.error(res.error)
            toast.success(res.summary, { description: res.note ?? undefined })
          })
        }
      >
        <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" />
        {pending ? 'Učím se…' : 'Spustit učení teď'}
      </Button>
      <span className="text-xs text-quiet">Rozbor AI stojí do pár korun.</span>
    </div>
  )
}
