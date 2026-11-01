'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, KeyRound } from 'lucide-react'
import { createOrRotateAgentKey, revokeProjectAgentKey } from '@/app/project-agent-key-actions'
import { formatDate } from '@/lib/utils'

export interface AgentKeyView {
  prefixMask: string
  createdAt: string
  lastUsedAt: string | null
}

interface Props {
  projectId: string
  active: AgentKeyView | null
  /** Hotové texty složené na serveru (bez klíče). */
  envBlock: string
  claudeMdBlock: string
  configured: boolean
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.error('Kopírování se nepovedlo, označte text ručně.')
  }
}

/** Klíč projektu pro hlášení z Claude Code: vytvořit, otočit, zneplatnit. */
export function AgentKeyPanel({ projectId, active, envBlock, claudeMdBlock, configured }: Props) {
  const [shownKey, setShownKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function issue() {
    setError(null)
    startTransition(async () => {
      const res = await createOrRotateAgentKey(projectId)
      if (res.success) setShownKey(res.key)
      else setError(res.error)
    })
  }

  function revoke() {
    setError(null)
    startTransition(async () => {
      const res = await revokeProjectAgentKey(projectId)
      if (!res.success) setError(res.error ?? 'Změna se nepovedla.')
      else {
        setShownKey(null)
        toast.success('Klíč byl zneplatněn.')
      }
    })
  }

  const btn =
    'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-brand-50 disabled:opacity-50'

  return (
    <div className="space-y-4">
      {!configured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Chybí nastavení AGENT_KEY_PEPPER, klíč zatím nejde vytvořit.
        </p>
      )}

      {active ? (
        <p className="text-sm text-foreground">
          Platný klíč <span className="font-mono">{active.prefixMask}</span>, vytvořený {formatDate(active.createdAt)}
          {active.lastUsedAt ? `, naposledy použitý ${formatDate(active.lastUsedAt)}` : ', zatím nepoužitý'}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Projekt zatím nemá klíč. Hlášení z Claude Code jde posílat až s ním.</p>
      )}

      {shownKey && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-medium text-amber-900">
            Zkopírujte si klíč teď. Podruhé už se neukáže.
          </p>
          <code className="block break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-foreground">{shownKey}</code>
          <button type="button" onClick={() => copy(shownKey, 'Klíč zkopírován.')} className={`${btn} mt-2`}>
            <Copy size={14} strokeWidth={1.5} />
            Zkopírovat klíč
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={issue} disabled={isPending || !configured} className={btn}>
          <KeyRound size={14} strokeWidth={1.5} />
          {active ? 'Otočit klíč' : 'Vytvořit klíč'}
        </button>
        {active && (
          <button type="button" onClick={revoke} disabled={isPending} className={btn}>
            Zneplatnit
          </button>
        )}
        <button type="button" onClick={() => copy(`${claudeMdBlock}\n\n${envBlock}`, 'Nastavení zkopírováno.')} className={btn}>
          <Copy size={14} strokeWidth={1.5} />
          Zkopírovat nastavení pro Claude Code
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Klíč umí jen uložit koncept hlášení do tohoto projektu. Nic nečte a nic nezveřejní, to děláte vy schválením.
      </p>
    </div>
  )
}
