'use client'

import { useState, useTransition } from 'react'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardHead } from '@/components/admin/card'
import { Button } from '@/components/ui/button'
import { confirmTotpSetup, disableTotp, startTotpSetup, type TotpSetup } from '@/app/totp-actions'

/**
 * Zapnutí a vypnutí ověřovací aplikace (AD19 / R-105). Tři stavy: vypnuto,
 * právě se nastavuje (QR a kód), zapnuto.
 */
export function TotpCard({ enabled: initial }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [code, setCode] = useState('')
  const [isPending, startTransition] = useTransition()

  function start() {
    startTransition(async () => {
      const res = await startTotpSetup()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setSetup(res.data)
      setCode('')
    })
  }

  function confirm() {
    if (!setup) return
    startTransition(async () => {
      const res = await confirmTotpSetup(setup.factorId, code)
      if (!res.ok) {
        toast.error(res.error)
        setCode('')
        return
      }
      setSetup(null)
      setEnabled(true)
      toast.success('Ověřovací aplikace je zapnutá. Příště po heslu zadáte kód.')
    })
  }

  function disable() {
    startTransition(async () => {
      const res = await disableTotp()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setEnabled(false)
      toast.success('Ověřovací aplikace je vypnutá. Do adminu teď stačí heslo.')
    })
  }

  return (
    <Card>
      <CardHead
        title="Přihlášení"
        hint={
          enabled
            ? 'Kromě hesla chceme při přihlášení kód z ověřovací aplikace.'
            : 'Teď stačí k přihlášení heslo. Ověřovací aplikace přidá druhý krok.'
        }
      />

      <div className="flex items-start gap-3">
        {enabled ? (
          <ShieldCheck size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-navy-700" />
        ) : (
          <ShieldOff size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-quiet" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {enabled ? 'Dvoufázové ověření je zapnuté' : 'Dvoufázové ověření je vypnuté'}
          </p>

          {!enabled && !setup && (
            <Button type="button" onClick={start} disabled={isPending} className="mt-3">
              {isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
              Zapnout
            </Button>
          )}

          {enabled && (
            <Button type="button" variant="outline" onClick={disable} disabled={isPending} className="mt-3">
              {isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
              Vypnout
            </Button>
          )}

          {setup && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-quiet">
                Načtěte kód v aplikaci (Google Authenticator, 1Password, Authy) a opište, co ukáže.
              </p>

              {/* Obyčejný <img>: QR je hotový `data:` PNG, optimalizovat ho nemá co. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qr}
                alt="QR kód pro ověřovací aplikaci"
                width={160}
                height={160}
                className="rounded-chip border border-navy-100 bg-surface p-2"
              />

              <p className="text-sm text-quiet">
                Nejde načíst? Zadejte do aplikace ručně tenhle klíč:{' '}
                <span className="font-num break-all text-ink">{setup.secret}</span>
              </p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="totp-code" className="text-sm font-medium text-ink">
                  Kód z aplikace
                </label>
                <input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="font-num min-h-11 max-w-40 rounded-chip border border-navy-100 bg-surface px-3 py-2.5 text-sm tracking-[0.3em] transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-navy-700"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={confirm} disabled={isPending || code.length !== 6}>
                  {isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
                  Potvrdit
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSetup(null)} disabled={isPending}>
                  Zrušit
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
