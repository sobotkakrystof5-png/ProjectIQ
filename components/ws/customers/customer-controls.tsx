'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import {
  addCustomerStamp,
  adjustStamps,
  eraseCustomer,
  findMergeCandidates,
  mergeCustomers,
  redeemReward,
  undoCustomerStamp,
  undoRedeemReward,
  setContactConsent,
  setCustomerEnded,
  updateCustomer,
  type MergeCandidate,
} from '@/app/w/[business]/zakaznici/actions'
import { undoToast, useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { cn } from '@/lib/ws/utils'

const TEXTAREA =
  'w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

// --- Věrnostní karta ------------------------------------------------------------

/** Jedním kliknutím přidá razítko nebo uplatní odměnu; ruční oprava zůstává vedlejší. */
export function LoyaltyControls({ slug, customerId, full, today }: { slug: string; customerId: string; full: boolean; today: string }) {
  const { run, pending } = useWsAction()
  const router = useRouter()
  const [delta, setDelta] = useState<1 | -1 | null>(null)
  const [reason, setReason] = useState('')
  const [day, setDay] = useState(today)
  const [note, setNote] = useState('')

  const stamp = () =>
    void run(
      () => addCustomerStamp({ slug, customerId, day, note }),
      (r) => {
        setNote('')
        undoToast(
          r.message,
          () => undoCustomerStamp({ slug, eventId: r.undoEventId, expectedStamps: r.expectedStamps }),
          { done: 'Razítko vráceno.', refresh: () => router.refresh() },
        )
      },
    )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!delta) return
    if (reason.trim().length < 2) {
      toast.error('Napište prosím krátce důvod.')
      return
    }
    void run(
      () => adjustStamps({ slug, customerId, delta, reason }),
      (r) => {
        toast.success(r.message)
        setDelta(null)
        setReason('')
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {full && (
          <Button
            disabled={pending}
            onClick={() =>
              void run(
                () => redeemReward({ slug, customerId }),
                (r) =>
                  undoToast(
                    r.message,
                    () => undoRedeemReward({ slug, eventId: r.undoEventId }),
                    { done: 'Uplatnění odměny vráceno.', refresh: () => router.refresh() },
                  ),
              )
            }
          >
            Uplatnit odměnu
          </Button>
        )}
        {!full && (
          <Button disabled={pending} onClick={stamp}>
            <Plus aria-hidden size={16} strokeWidth={1.5} />
            Razítko
          </Button>
        )}
        <Button variant="ghost" disabled={pending} aria-expanded={delta === -1} onClick={() => setDelta(delta === -1 ? null : -1)}>
          <Minus aria-hidden size={16} strokeWidth={1.5} />
          Upravit razítka
        </Button>
      </div>
      {!full && (
        <details className="rounded-chip border px-3 py-2">
          <summary className="flex min-h-7 cursor-pointer items-center text-sm font-medium text-ink">Datum nebo poznámka</summary>
          <div className="grid gap-3 pt-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`datum-razitka-${customerId}`}>Datum razítka</Label>
              <Input id={`datum-razitka-${customerId}`} type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="font-num" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`poznamka-razitka-${customerId}`}>Poznámka (nepovinná)</Label>
              <Input
                id={`poznamka-razitka-${customerId}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="Například zapomenuté razítko"
              />
            </div>
          </div>
        </details>
      )}
      {delta === -1 && (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-box border bg-ground p-4 dark:bg-navy-950">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`duvod-${customerId}`}>Proč razítko odebíráte</Label>
            <Input
              id={`duvod-${customerId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="Například přidané omylem"
              autoFocus
            />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              Odebrat razítko
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

// --- Údaje a poznámka --------------------------------------------------------------

export function CustomerEditForm({
  slug,
  customer,
}: {
  slug: string
  customer: { id: string; name: string; phone: string | null; email: string | null; birthday: string | null; note: string | null }
}) {
  const { run, pending } = useWsAction()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [email, setEmail] = useState(customer.email ?? '')
  const [birthday, setBirthday] = useState(customer.birthday ?? '')
  const [note, setNote] = useState(customer.note ?? '')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      () => updateCustomer({ slug, customerId: customer.id, name, phone, email, birthday, note }),
      () => {
        toast.success('Uloženo')
        setOpen(false)
      },
    )
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        {customer.note && (
          <p className="whitespace-pre-line rounded-chip bg-navy-50 px-3 py-2.5 text-sm text-ink dark:bg-navy-800 dark:text-navy-100">
            {customer.note}
          </p>
        )}
        <div>
          <Button variant="outline" onClick={() => setOpen(true)}>
            {customer.note ? 'Upravit údaje a poznámku' : 'Upravit údaje, přidat poznámku'}
          </Button>
        </div>
      </div>
    )
  }

  const id = (f: string) => `zak-${f}-${customer.id}`
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-box border bg-ground p-4 dark:bg-navy-950">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id('jmeno')}>Jméno</Label>
        <Input id={id('jmeno')} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id('telefon')}>Telefon</Label>
          <Input id={id('telefon')} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="font-num" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id('email')}>E-mail</Label>
          <Input id={id('email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id('narozeniny')}>Narozeniny (nepovinné)</Label>
        <Input id={id('narozeniny')} type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="font-num sm:max-w-[220px]" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id('poznamka')}>Poznámka</Label>
        <textarea id={id('poznamka')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={4} className={TEXTAREA} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          Uložit
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Zavřít
        </Button>
      </div>
    </form>
  )
}

// --- Souhlas s nabídkami -------------------------------------------------------------

export function ConsentSwitch({ slug, customerId, consent, unsubscribed }: { slug: string; customerId: string; consent: boolean; unsubscribed: boolean }) {
  const { run, pending } = useWsAction()
  const [on, setOn] = useState(consent)
  const id = `souhlas-${customerId}`
  const change = (next: boolean) => {
    setOn(next)
    void run(
      () => setContactConsent({ slug, customerId, consent: next }),
      () => toast.success(next ? 'Souhlas je uložený.' : 'Bez souhlasu. Do „Komu napsat“ se nedostane.'),
    ).then((done) => {
      if (!done) setOn(!next)
    })
  }
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>Souhlasí se zasíláním nabídek</Label>
        <p className="text-sm text-quiet">
          {unsubscribed && !on ? 'Odhlášeno z nabídek. Zapněte jen s novým souhlasem.' : 'Bez souhlasu nenavrhneme žádnou zprávu.'}
        </p>
      </div>
      <Switch id={id} checked={on} onCheckedChange={change} disabled={pending} />
    </div>
  )
}

// --- Ukončení spolupráce ---------------------------------------------------------------

export function EndCustomer({ slug, customerId, ended, reason }: { slug: string; customerId: string; ended: boolean; reason: string | null }) {
  const { run, pending } = useWsAction()
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState('')

  if (ended) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-quiet">Spolupráce je ukončená{reason ? `: ${reason}` : '.'}</p>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => void run(() => setCustomerEnded({ slug, customerId, ended: false }), () => toast.success('Zákazník je zpátky.'))}
        >
          Vrátit mezi zákazníky
        </Button>
      </div>
    )
  }

  const end = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      () => setCustomerEnded({ slug, customerId, ended: true, reason: text || undefined }),
      () => {
        setAsking(false)
        undoToast('Spolupráce je ukončená, nabídky nedostane.', () => setCustomerEnded({ slug, customerId, ended: false }), {
          done: 'Zákazník je zpátky.',
        })
      },
    )
  }

  return asking ? (
    <form onSubmit={end} className="flex flex-col gap-3 rounded-box border bg-ground p-4 dark:bg-navy-950">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`konec-${customerId}`}>Důvod (nepovinné)</Label>
        <Input id={`konec-${customerId}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Například stěhování" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          Ukončit spolupráci
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
          Zavřít
        </Button>
      </div>
    </form>
  ) : (
    <div>
      <Button variant="ghost" className="text-danger hover:bg-danger/10" onClick={() => setAsking(true)}>
        Ukončit spolupráci
      </Button>
    </div>
  )
}

// --- Sloučení duplicit ------------------------------------------------------------------

/**
 * Sloučit s jiným zákazníkem: vybraný (duplikát) se přesune sem a smaže.
 * Nejde vrátit, proto dva kroky: vybrat, potom Sloučit (R-046).
 */
export function MergeBox({
  slug,
  customerId,
  customerName,
  suggested,
}: {
  slug: string
  customerId: string
  customerName: string
  suggested: MergeCandidate[]
}) {
  const { run, pending } = useWsAction()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<MergeCandidate[]>([])
  const [picked, setPicked] = useState<MergeCandidate | null>(null)

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setFound([])
      return
    }
    let alive = true
    const t = setTimeout(async () => {
      try {
        const res = await findMergeCandidates({ slug, customerId, query: text })
        if (alive && res.ok) setFound(res.data)
      } catch {
        // hledání je jen pomocník, chyba se neukazuje
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, slug, customerId])

  const options = query.trim().length >= 2 ? found : suggested

  if (picked) {
    return (
      <div className="flex flex-col gap-3 rounded-box border bg-ground p-4 dark:bg-navy-950">
        <p className="text-[15px] text-ink">
          Návštěvy, poptávky, platby a razítka zákazníka <strong>{picked.name}</strong> přesuneme k zákazníkovi <strong>{customerName}</strong>.
          Chybějící telefon nebo e-mail doplníme. Záznam {picked.name} potom smažeme a nejde to vrátit.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              void run(
                () => mergeCustomers({ slug, keepId: customerId, dropId: picked.id }),
                (r) => {
                  toast.success(r.message)
                  setPicked(null)
                  setQuery('')
                },
              )
            }
          >
            Sloučit
          </Button>
          <Button variant="ghost" onClick={() => setPicked(null)}>
            Zpět
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`slouceni-${customerId}`}>Najít stejného zákazníka</Label>
        <Input
          id={`slouceni-${customerId}`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={80}
          placeholder="Jméno, telefon nebo e-mail"
        />
      </div>
      {options.length > 0 && (
        <ul className="flex flex-col gap-1">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setPicked(o)}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-3 rounded-chip px-3 py-2 text-left transition-colors hover:bg-navy-50 dark:hover:bg-navy-900',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-ink">{o.name}</span>
                  {o.contact && <span className="block truncate font-num text-xs text-quiet">{o.contact}</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold text-navy-700 dark:text-navy-200">Vybrat</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --- Výmaz na žádost (GDPR, S18) -------------------------------------------------------

/**
 * Smazání zákazníka, který o to požádal. Nejde vrátit, proto potvrzení
 * jménem. Historie zůstane bez osobních údajů, vystavené faktury zůstanou.
 */
export function EraseCustomer({ slug, customerId, customerName }: { slug: string; customerId: string; customerName: string }) {
  const { run, pending } = useWsAction()
  const router = useRouter()
  const pathname = usePathname()
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState('')
  const matches = text.trim().toLocaleLowerCase('cs') === customerName.trim().toLocaleLowerCase('cs')

  if (!asking) {
    return (
      <div>
        <Button variant="ghost" className="text-danger hover:bg-danger/10" onClick={() => setAsking(true)}>
          Smazat na žádost zákazníka
        </Button>
      </div>
    )
  }

  const erase = (e: React.FormEvent) => {
    e.preventDefault()
    if (!matches) return
    void run(
      () => eraseCustomer({ slug, customerId }),
      (r) => {
        toast.success(r.message)
        router.replace(pathname)
      },
    )
  }

  return (
    <form onSubmit={erase} className="flex flex-col gap-3 rounded-box border border-danger/40 bg-ground p-4">
      <p className="text-[15px] text-ink">
        Smažeme kontakty, poznámky, věrnostní kartu, hodnocení a zprávy zákazníka <strong>{customerName}</strong>. V termínech, zakázkách
        a poptávkách zůstane „Smazaný zákazník“, aby seděly přehledy. Vystavené faktury zůstanou, zákon je vyžaduje uchovat 10 let.
        Vrátit to nejde.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`smazat-${customerId}`}>Pro potvrzení napište jméno zákazníka</Label>
        <Input id={`smazat-${customerId}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoComplete="off" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={pending || !matches}>
          Smazat natrvalo
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
          Zavřít
        </Button>
      </div>
    </form>
  )
}
