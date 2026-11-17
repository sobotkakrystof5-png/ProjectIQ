'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck2 } from 'lucide-react'
import { Card, CardHead } from '@/components/admin/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { disconnectGoogleAccount } from '@/app/meeting-actions'
import type { GoogleStatus } from '@/lib/admin/google/oauth'

/**
 * Propojení Google Kalendáře (R-112). Bez něj nevznikne odkaz na Google Meet
 * u schůzky s firmou od AI asistenta. Propojení je odkaz (ne formulář) —
 * přesměrování na Google tak CSP `form-action` nepotřebuje.
 */
const RESULT: Record<string, { ok: boolean; text: string }> = {
  propojeno: { ok: true, text: 'Google Kalendář je propojený.' },
  zamitnuto: { ok: false, text: 'Propojení jste u Googlu zrušil.' },
  neplatne: { ok: false, text: 'Propojení vypršelo. Zkuste to prosím znovu.' },
  chyba: { ok: false, text: 'Propojení se nepovedlo. Zkuste to prosím znovu.' },
  'chybi-nastaveni': { ok: false, text: 'Na serveru chybí nastavení Googlu.' },
}

export function GoogleCard({ status, result }: { status: GoogleStatus; result: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const message = result ? RESULT[result] : undefined

  const disconnect = () =>
    start(async () => {
      await disconnectGoogleAccount()
      toast.success('Google Kalendář je odpojený.')
      router.refresh()
    })

  return (
    <Card id="google">
        <CardHead
          title="Google Kalendář a Meet"
          hint="Schůzky s klienty dostanou odkaz na Google Meet a objeví se vám v Google Kalendáři."
        />
        {message && (
          <p className={message.ok ? 'mb-3 text-sm text-ink' : 'mb-3 text-sm text-danger'} role="status">
            {message.text}
          </p>
        )}
        {!status.configured ? (
          <p className="text-sm text-quiet">
            Na serveru chybí GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET nebo GOOGLE_TOKEN_KEY.
          </p>
        ) : status.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-ink">
              <CalendarCheck2 size={16} strokeWidth={1.5} aria-hidden="true" className="text-navy-700" />
              Propojeno{status.email ? ` jako ${status.email}` : ''}
            </p>
            <Button type="button" variant="ghost" onClick={disconnect} disabled={pending}>
              Odpojit
            </Button>
          </div>
        ) : (
          <a
            href="/api/google/connect"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-navy-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Propojit Google účet
          </a>
        )}
    </Card>
  )
}
