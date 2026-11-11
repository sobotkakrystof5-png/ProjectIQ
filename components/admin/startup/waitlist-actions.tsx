'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, RefreshCw, Send } from 'lucide-react'
import { exportWaitlistCsv, sendLaunchEmailBlast } from '@/app/dashboard/startup/startup-actions'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

/**
 * Akce nad waitlistem (AD07): rozeslání launch e-mailů, export a obnovení.
 * Tabulka vedle je serverová, tohle je jediný klientský kus.
 */
export function WaitlistActions({ projectId, pending }: { projectId: string; pending: number }) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [exporting, startExport] = useTransition()

  const send = async () => {
    setSending(true)
    setConfirm(false)
    const result = await sendLaunchEmailBlast(projectId)
    setSending(false)
    if (result.error) toast.error(result.error)
    else if (result.total === 0) toast.info('Všichni už e-mail dostali.')
    else {
      toast.success(
        `Odesláno ${result.sent} z ${result.total} e-mailů${result.failed > 0 ? ` (${result.failed} se nepodařilo)` : ''}.`,
      )
      router.refresh()
    }
  }

  const exportCsv = () =>
    startExport(async () => {
      const csv = await exportWaitlistCsv(projectId)
      if (!csv) {
        toast.error('Export se nepodařil. Zkuste to za chvíli.')
        return
      }
      // BOM, ať Excel otevře češtinu správně.
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'waitlist.csv'
      link.click()
      URL.revokeObjectURL(url)
    })

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending > 0 &&
        (confirm ? (
          <>
            <span className="text-sm text-ink">Odejde {pending} e-mailů. Opravdu?</span>
            <Button onClick={send} disabled={sending}>
              {sending ? <Loader2 size={15} strokeWidth={1.5} className="animate-spin" /> : <Send size={15} strokeWidth={1.5} />}
              {sending ? 'Odesílá se…' : 'Ano, odeslat'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Zrušit
            </Button>
          </>
        ) : (
          <Button onClick={() => setConfirm(true)} disabled={sending}>
            <Send size={15} strokeWidth={1.5} />
            Odeslat launch e-maily
          </Button>
        ))}

      <Button variant="outline" onClick={exportCsv} disabled={exporting}>
        <Download size={15} strokeWidth={1.5} />
        {exporting ? 'Připravuje se…' : 'Stáhnout CSV'}
      </Button>
      <Button variant="ghost" onClick={() => router.refresh()}>
        <RefreshCw size={15} strokeWidth={1.5} />
        Obnovit
      </Button>
    </div>
  )
}
