'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FilePlus2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '../booking/when-fields'
import { useMoveJob } from './use-move-job'

/**
 * Stav zakázky v pravém panelu: výběr nového stavu (se „Zpět“) a na hotové
 * zakázce „Vystavit fakturu“. Stejná cesta jako na tabuli a v seznamu.
 */
export function JobStageControl({
  slug,
  jobId,
  stageId,
  stages,
  invoiceHref,
}: {
  slug: string
  jobId: string
  stageId: string | null
  stages: { id: string; name: string; type: string }[]
  /** Odkaz „Vystavit fakturu“; `null` = funkce Faktury je vypnutá. */
  invoiceHref: string | null
}) {
  const { move, pending } = useMoveJob(slug, stages)
  const [value, setValue] = useState(stageId ?? stages[0]?.id ?? '')
  useEffect(() => setValue(stageId ?? stages[0]?.id ?? ''), [stageId, stages])
  const type = stages.find((s) => s.id === value)?.type

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`stav-${jobId}`}>Stav zakázky</Label>
        <NativeSelect
          id={`stav-${jobId}`}
          value={value}
          onChange={(to) => {
            const from = value
            void move(jobId, from, to, { set: () => setValue(to), clear: () => setValue(from) })
          }}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id} disabled={pending}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {invoiceHref && (type === 'done' || type === 'paid') && (
        <Link
          href={invoiceHref}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-input bg-surface px-5 text-[15px] font-semibold text-ink hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FilePlus2 aria-hidden size={18} strokeWidth={1.5} />
          Vystavit fakturu
        </Link>
      )}
    </div>
  )
}
