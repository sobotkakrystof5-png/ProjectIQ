'use client'

import { useState, useTransition } from 'react'
import { Copy, KeyRound } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { createOrRotateWebKey, revokeProjectWebKey } from '@/app/project-web-key-actions'
import type { WebKeyInfo } from '@/lib/client-web/keys'
import { formatDate } from '@/lib/utils'

/**
 * Klíč webu zakázky (KP17, R-129): vytvořit, otočit, zneplatnit a zkopírovat
 * návod pro web klienta. Klíč se ukáže jen jednou hned po vytvoření.
 */

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.error('Kopírování se nepovedlo, označte text ručně.')
  }
}

const btn =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-chip border border-navy-100 px-3 text-sm font-medium text-ink hover:bg-navy-50 disabled:opacity-50'

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }).format(new Date(iso))

export function WebKeyPanel({
  projectId,
  active,
  lastTestAt,
  lastEventAt,
  envBlock,
  snippet,
  testCommand,
  configured,
}: {
  projectId: string
  active: WebKeyInfo | null
  lastTestAt: string | null
  lastEventAt: string | null
  /** Hotové texty složené na serveru (bez klíče). */
  envBlock: string
  snippet: string
  testCommand: string
  configured: boolean
}) {
  const [shownKey, setShownKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function issue() {
    setError(null)
    startTransition(async () => {
      const res = await createOrRotateWebKey(projectId)
      if (res.success) setShownKey(res.key)
      else setError(res.error)
    })
  }

  function revoke() {
    setError(null)
    startTransition(async () => {
      const res = await revokeProjectWebKey(projectId)
      if (!res.success) setError(res.error ?? 'Změna se nepovedla.')
      else {
        setShownKey(null)
        toast.success('Klíč webu přestal platit. Čísla zůstávají.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {!configured && (
        <p className="rounded-chip bg-signal-bg px-3 py-2 text-xs text-signal-ink">
          Chybí nastavení AGENT_KEY_PEPPER, klíč zatím nejde vytvořit.
        </p>
      )}

      {active ? (
        <div className="space-y-1 text-sm">
          <p className="text-ink">
            Web je napojený klíčem <span className="font-mono">{active.prefixMask}</span> z {formatDate(active.createdAt)}.
          </p>
          <p className="text-quiet">
            {lastEventAt ? `Poslední poptávka z webu ${dateTime(lastEventAt)}.` : 'Z webu zatím nepřišla žádná poptávka.'}
            {lastTestAt ? ` Zkušební událost dorazila ${dateTime(lastTestAt)}.` : ''}
          </p>
        </div>
      ) : (
        <p className="text-sm text-quiet">
          Web klienta zatím napojený není. Vytvořte klíč a dejte ho do nastavení serveru webu. Klient pak uvidí, kolik lidí mu přes web napsalo.
        </p>
      )}

      {shownKey && (
        <div className="rounded-chip border border-dashed border-signal-line bg-signal-bg p-3">
          <p className="mb-2 text-xs font-medium text-signal-ink">Zkopírujte si klíč teď. Podruhé už se neukáže.</p>
          <code className="block break-all rounded-chip bg-surface px-3 py-2 font-mono text-xs text-ink">{shownKey}</code>
          <button type="button" onClick={() => copy(shownKey, 'Klíč zkopírován.')} className={`${btn} mt-2`}>
            <Copy size={14} strokeWidth={1.5} aria-hidden="true" />
            Zkopírovat klíč
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={issue} disabled={pending || !configured} className={btn}>
          <KeyRound size={14} strokeWidth={1.5} aria-hidden="true" />
          {active ? 'Otočit klíč' : 'Vytvořit klíč'}
        </button>
        {active && (
          <button type="button" onClick={revoke} disabled={pending} className={btn}>
            Zneplatnit
          </button>
        )}
        <button type="button" onClick={() => copy(`${envBlock}\n\n${snippet}`, 'Návod pro web zkopírován.')} className={btn}>
          <Copy size={14} strokeWidth={1.5} aria-hidden="true" />
          Zkopírovat návod pro web
        </button>
        {active && (
          <button type="button" onClick={() => copy(testCommand, 'Příkaz pro zkoušku zkopírován.')} className={btn}>
            <Copy size={14} strokeWidth={1.5} aria-hidden="true" />
            Zkušební příkaz
          </button>
        )}
      </div>
      <p className="text-xs text-quiet">
        Klíč umí jen zapsat „přišla poptávka“ nebo „přišla objednávka“. Jméno, kontakt ani text poptávky se do ZakazIQ nedostanou, ty jdou klientovi e-mailem jako dřív.
      </p>
    </div>
  )
}
