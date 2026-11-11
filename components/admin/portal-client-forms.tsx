'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { Copy } from 'lucide-react'
import {
  createInvite,
  createPortalClient,
  linkProjectToClient,
  removeMember,
  revokeInvite,
  unlinkProject,
} from '@/app/portal-admin-actions'
import { formatDateTime } from '@/lib/utils'

const field =
  'min-h-[44px] w-full rounded-lg border border-border bg-white px-3 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100'
const btn =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium disabled:opacity-50'
const primary = `${btn} bg-navy-700 text-white hover:bg-navy-800`
const quiet = `${btn} border border-border text-foreground hover:bg-navy-50`

export function CreateClientForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await createPortalClient(name)
      if (!res.success) setError(res.error)
      else router.push(`/dashboard/klientsky-prostor/${res.id}`)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="portal-client-name">Název firmy</label>
      <input id="portal-client-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Název firmy klienta" className={field} />
      <button type="submit" disabled={pending} className={primary}>Založit klienta</button>
      {error && <p className="text-sm text-red-600 sm:self-center">{error}</p>}
    </form>
  )
}

export function LinkProjectForm({ clientId, options }: { clientId: string; options: { id: string; label: string }[] }) {
  const router = useRouter()
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId) return
    setError(null)
    start(async () => {
      const res = await linkProjectToClient(clientId, projectId)
      if (!res.success) setError(res.error)
      else {
        setProjectId('')
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="portal-link-project">Zakázka</label>
      <select id="portal-link-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={field}>
        <option value="">Vyberte zakázku…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <button type="submit" disabled={pending || !projectId} className={primary}>Propojit</button>
      {error && <p className="text-sm text-red-600 sm:self-center">{error}</p>}
    </form>
  )
}

export function UnlinkButton({ clientId, projectId }: { clientId: string; projectId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await unlinkProject(clientId, projectId); router.refresh() })}
      className={quiet}
    >
      Odpojit
    </button>
  )
}

export function InviteForm({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'member'>('member')
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLink(null)
    start(async () => {
      const res = await createInvite(clientId, email || null, role)
      if (!res.success) setError(res.error)
      else {
        setLink({ url: res.url, expiresAt: res.expiresAt })
        setEmail('')
        router.refresh()
      }
    })
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success('Odkaz zkopírován.')
    } catch {
      toast.error('Kopírování se nepovedlo, označte odkaz ručně.')
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="invite-email">E-mail (nepovinné, pozvánka pak půjde použít jen s ním)</label>
          <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="jana@firma.cz" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="invite-role">Role</label>
          <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as 'owner' | 'member')} className={field}>
            <option value="member">Člen</option>
            <option value="owner">Vlastník</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className={`${primary} sm:self-end`}>Vytvořit pozvánku</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {link && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-medium text-amber-900">
            Zkopírujte odkaz a pošlete ho klientovi. Podruhé se neukáže. Platí do {formatDateTime(link.expiresAt)}, jde použít jednou.
          </p>
          <code className="block break-all rounded-lg bg-white px-3 py-2 font-mono text-xs">{link.url}</code>
          <button type="button" onClick={copy} className={`${quiet} mt-2`}>
            <Copy size={14} strokeWidth={1.5} /> Zkopírovat odkaz
          </button>
        </div>
      )}
    </div>
  )
}

export function RevokeInviteButton({ clientId, inviteId }: { clientId: string; inviteId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await revokeInvite(clientId, inviteId); router.refresh() })} className={quiet}>
      Zrušit
    </button>
  )
}

export function RemoveMemberButton({ clientId, memberId }: { clientId: string; memberId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await removeMember(clientId, memberId); toast.message('Člen odebrán.'); router.refresh() })} className={quiet}>
      Odebrat
    </button>
  )
}
