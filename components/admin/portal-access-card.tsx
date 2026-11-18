'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, Send, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { Card, CardHead } from '@/components/admin/card'
import { inviteToClientSpace, revokeInvite, undoClientSpaceInvite } from '@/app/portal-admin-actions'
import { PORTAL_INVITE_DELAY_MS } from '@/lib/portal/invite-delay'
import type { ProjectPortalAccess } from '@/lib/portal/project-access'
import { formatDate } from '@/lib/utils'

/** „Novák s.r.o." už tečku má, druhou za ni nepřidávat. */
const withPeriod = (s: string): string => (s.trim().endsWith('.') ? s.trim() : `${s.trim()}.`)

/**
 * Klientský prostor u zakázky (KP11, R-121): pozvat klienta jedním klikem,
 * vidět, kdo v prostoru je a čí pozvánka čeká. E-mail odchází z krystof@vizeon.cz
 * po 10 s a do té doby jde vzít zpět. Heslo si klient nastaví sám (D-K12).
 */
export function PortalAccessCard({
  projectId,
  access,
  defaults,
}: {
  projectId: string
  access: ProjectPortalAccess
  defaults: { company: string; email: string }
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [company, setCompany] = useState(defaults.company)
  const [email, setEmail] = useState(access.members.length || access.pending.length ? '' : defaults.email)
  const [formOpen, setFormOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLink, setLastLink] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; name: string; email: string } | null>(null)

  if (!access.available) {
    return (
      <Card>
        <CardHead
          title="Klientský prostor"
          hint="V databázi zatím klientský prostor není (chybí migrace 095), takže pozvat nejde."
          className="mb-0"
        />
      </Card>
    )
  }

  const hasPeople = access.members.length > 0 || access.pending.length > 0
  const showForm = !hasPeople || formOpen

  function invite(target: string, confirmClientId?: string) {
    setError(null)
    setConfirm(null)
    start(async () => {
      const res = await inviteToClientSpace(projectId, { company, email: target, confirmClientId })
      if (!res.success) {
        if (res.confirmClient) {
          setConfirm({ ...res.confirmClient, email: target })
          return
        }
        setError(res.error)
        // Formulář je schovaný (např. „Poslat znovu“), hláška by jinak nebyla vidět.
        if (!showForm) toast.error(res.error)
        return
      }
      setLastLink(res.url)
      setFormOpen(false)
      setEmail('')
      router.refresh()

      const undo = () =>
        start(async () => {
          const back = await undoClientSpaceInvite(projectId, res.inviteId, res.unlinkOnUndo)
          if (!back.success) toast.error(back.error)
          else {
            setLastLink(null)
            toast.success('Vráceno, nic neodešlo')
          }
          router.refresh()
        })

      if (res.emailScheduled) {
        toast.message(
          res.mode === 'invite' ? `Pozvánka pro ${res.email} odejde za 10 s` : `Zpráva o zakázce pro ${res.email} odejde za 10 s`,
          { undo, duration: PORTAL_INVITE_DELAY_MS },
        )
      } else {
        toast.message('Pozvánka je připravená, ale e-mail neodejde', {
          description: 'Chybí nastavení odesílání. Zkopírujte odkaz a pošlete ho klientovi sami.',
          undo,
        })
      }
    })
  }

  function cancel(inviteId: string) {
    if (!access.client) return
    const clientId = access.client.id
    start(async () => {
      const res = await revokeInvite(clientId, inviteId)
      if (!res.success) toast.error(res.error)
      else toast.success('Pozvánka zrušená, odkaz už nefunguje')
      router.refresh()
    })
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Odkaz zkopírovaný')
    } catch {
      toast.error('Odkaz se nepodařilo zkopírovat. Označte ho a zkopírujte ručně.')
    }
  }

  return (
    <Card>
      <CardHead
        title="Klientský prostor"
        hint={
          access.client
            ? `Prostor firmy ${withPeriod(access.client.name)} Klient tu vidí postup zakázky a může vám psát.`
            : 'Klient dostane e-mail z krystof@vizeon.cz a heslo si nastaví sám.'
        }
      />

      {access.members.length > 0 && (
        <ul className="mb-4 divide-y divide-navy-100 rounded-chip border border-navy-100">
          {access.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-ink">{m.name || m.email || 'Člen bez jména'}</span>
                {m.name && m.email && <span className="block break-all text-xs text-quiet">{m.email}</span>}
              </span>
              <span className="text-xs text-quiet">
                v prostoru od <span className="font-num">{formatDate(m.since)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {access.pending.map((inv) => (
        <div key={inv.id} className="mb-4 rounded-chip border border-navy-100 bg-navy-50 px-4 py-3">
          <p className="text-sm text-ink">
            Pozvánka pro <span className="break-all font-medium">{inv.email}</span> čeká na přijetí.
          </p>
          <p className="mt-1 text-xs text-quiet">
            Odeslaná <span className="font-num">{formatDate(inv.createdAt)}</span>, platí do{' '}
            <span className="font-num">{formatDate(inv.expiresAt)}</span>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => invite(inv.email)}>
              <Send size={16} strokeWidth={1.5} aria-hidden="true" />
              Poslat znovu
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => cancel(inv.id)}>
              Zrušit pozvánku
            </Button>
          </div>
        </div>
      ))}

      {lastLink && (
        <div className="mb-4 flex flex-col gap-2 rounded-chip border border-navy-100 px-4 py-3 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-xs text-quiet">
            Odkaz z poslední pozvánky uvidíte jen teď. Hodí se, když klient e-mail nenajde.
          </p>
          <Button variant="outline" onClick={() => copy(lastLink)}>
            <Copy size={16} strokeWidth={1.5} aria-hidden="true" />
            Zkopírovat odkaz
          </Button>
        </div>
      )}

      {confirm && (
        <div role="alert" className="mb-4 rounded-chip border border-navy-100 bg-navy-50 px-4 py-3">
          <p className="text-sm text-ink">
            <span className="break-all font-medium">{confirm.email}</span> už má prostor firmy{' '}
            <span className="font-medium">{confirm.name}</span>. Když zakázku přidáte tam, uvidí ji všichni lidé
            z toho prostoru.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => invite(confirm.email, confirm.id)}>
              Přidat do tohoto prostoru
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>
              Nepřidávat
            </Button>
          </div>
        </div>
      )}

      {showForm ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            invite(email)
          }}
        >
          {!access.client && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`prostor-firma-${projectId}`}>Firma klienta</Label>
              <Input
                id={`prostor-firma-${projectId}`}
                value={company}
                maxLength={200}
                onChange={(e) => setCompany(e.target.value)}
                autoComplete="organization"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`prostor-email-${projectId}`}>E-mail klienta</Label>
            <Input
              id={`prostor-email-${projectId}`}
              type="email"
              value={email}
              maxLength={320}
              required
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              <Send size={16} strokeWidth={1.5} aria-hidden="true" />
              Pozvat do prostoru
            </Button>
            {hasPeople && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setFormOpen(false)}>
                Zavřít
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setFormOpen(true)}>
            <UserPlus size={16} strokeWidth={1.5} aria-hidden="true" />
            Pozvat dalšího člověka
          </Button>
          {access.client && (
            <Link
              href={`/dashboard/klientsky-prostor/${access.client.id}`}
              className="inline-flex min-h-[44px] items-center px-3 text-sm font-medium text-navy-700 hover:text-navy-900"
            >
              Spravovat prostor
            </Link>
          )}
        </div>
      )}
    </Card>
  )
}
