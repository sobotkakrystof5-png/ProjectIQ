'use client'

import { useState } from 'react'
import { Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'
import {
  getCustomerMessageTemplates,
  saveCustomerContact,
  sendCustomerMessage,
  undoCustomerMessage,
  type MergeCandidate,
} from '@/app/w/[business]/zakaznici/actions'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { MergeBox } from './customer-controls'
import { CUSTOMER_MESSAGE_TYPES, fillTemplate, MESSAGES, type CustomerMessageType, type TemplateValues } from '@/lib/ws/email/catalog'
import { formatPhone } from '@/lib/ws/format-phone'
import { mailtoAddress } from '@/lib/ws/email/mailto'

type Template = { type: CustomerMessageType; subject: string; body: string; enabled: boolean }

/** Kontakt vždy po ruce. Nabídky se zobrazí jen zákazníkům se souhlasem. */
export function CustomerContactActions({
  slug,
  customerId,
  customerName,
  businessName,
  phone: initialPhone,
  email: initialEmail,
  consent,
  unsubscribed,
  ended,
  context = {},
  compact = false,
}: {
  slug: string
  customerId: string
  customerName: string
  businessName: string
  phone: string | null
  email: string | null
  consent: boolean
  unsubscribed: boolean
  ended: boolean
  context?: { nextVisit?: string | null; service?: string | null; job?: string | null }
  compact?: boolean
}) {
  const router = useRouter()
  const { run, pending } = useWsAction()
  const [phone, setPhone] = useState(initialPhone)
  const [email, setEmail] = useState(initialEmail)
  const [adding, setAdding] = useState<'phone' | 'email' | null>(null)
  const [value, setValue] = useState('')
  const [duplicate, setDuplicate] = useState<MergeCandidate | null>(null)
  const [open, setOpen] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [type, setType] = useState<CustomerMessageType>(context.nextVisit ? 'customer_booking' : 'customer_custom')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const values: TemplateValues = {
    jmeno: customerName,
    byznys: businessName,
    termin: context.nextVisit
      ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(context.nextVisit))
      : '',
    sluzba: context.service ?? '',
    zakazka: context.job ?? '',
  }

  const openMessage = async () => {
    setOpen(true)
    if (templates.length) return
    setLoadingTemplates(true)
    try {
      const res = await getCustomerMessageTemplates({ slug })
      if (!res.ok) {
        toast.error(res.error)
        setOpen(false)
        return
      }
      setTemplates(res.data)
      const firstType: CustomerMessageType = context.nextVisit ? 'customer_booking' : 'customer_custom'
      setType(firstType)
      const first = res.data.find((x) => x.type === firstType)
      if (first) {
        setSubject(fillTemplate(first.subject, values))
        setBody(fillTemplate(first.body, values))
      }
    } catch {
      toast.error('Šablony se nepodařilo načíst. Zkuste to prosím znovu.')
      setOpen(false)
    } finally {
      setLoadingTemplates(false)
    }
  }

  const selectTemplate = (next: CustomerMessageType) => {
    setType(next)
    const template = templates.find((item) => item.type === next)
    if (!template) return
    setSubject(fillTemplate(template.subject, values))
    setBody(fillTemplate(template.body, values))
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      () => sendCustomerMessage({ slug, customerId, type, subject, body }),
      (result) => {
        setOpen(false)
        if (result.mode === 'mailto') {
          window.location.assign(result.href)
          return
        }
        toast.success('E-mail čeká na odeslání.', {
          duration: 60_000,
          undoLabel: 'Zpět',
          undo: async () => {
            try {
              const undone = await undoCustomerMessage({ slug, customerId, id: result.id })
              if (undone.ok) {
                toast.message('E-mail je vrácený.')
                router.refresh()
              } else toast.error(undone.error)
            } catch {
              toast.error('Spojení se nepovedlo. Zkuste to prosím znovu.')
            }
          },
        })
      },
    )
  }

  const saveContact = (e: React.FormEvent) => {
    e.preventDefault()
    if (!adding || !value.trim()) return
    void run(
      () => saveCustomerContact({ slug, customerId, field: adding, value }),
      (result) => {
        if (result.duplicateOf) {
          setDuplicate({ ...result.duplicateOf, contact: value.trim() })
          return
        }
        if (adding === 'email') setEmail(result.value)
        else setPhone(result.value)
        setAdding(null)
        setValue('')
        toast.success('Kontakt je uložený.')
      },
    )
  }

  const selectedTemplate = templates.find((item) => item.type === type)
  const offerBlocked = !consent || unsubscribed || ended
  const encodedEmail = email ? mailtoAddress(email) : null

  return (
    <div className={compact ? 'flex min-w-0 flex-col items-start gap-1' : 'flex flex-col gap-2'}>
      <ul className="flex min-w-0 max-w-full flex-col gap-0.5 text-[15px]">
        {phone && (
          <li>
            <a href={`tel:${phone}`} className="inline-flex min-h-9 items-center gap-2 whitespace-nowrap text-ink underline-offset-4 hover:underline">
              <Phone aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-quiet" />
              <span className="font-num text-sm">{formatPhone(phone)}</span>
            </a>
          </li>
        )}
        {email && (
          <li className="flex min-w-0 flex-wrap items-center gap-2">
            {encodedEmail ? <a href={`mailto:${encodedEmail}`} className="inline-flex min-h-9 max-w-full items-center gap-2 text-ink underline-offset-4 hover:underline">
              <Mail aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-quiet" />
              <span className="truncate">{email}</span>
            </a> : <span className="inline-flex min-h-9 max-w-full items-center gap-2 text-ink">
              <Mail aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-quiet" /><span className="truncate">{email}</span>
            </span>}
            {encodedEmail && <Button type="button" variant="outline" className="min-h-9 px-3 text-sm" onClick={openMessage}>Napsat e-mail</Button>}
          </li>
        )}
      </ul>

      {unsubscribed && email && <p className="text-sm text-quiet">Zákazník se odhlásil z nabídek. Osobní zprávu k termínu nebo zakázce mu poslat můžete.</p>}

      {(!phone || !email) && (
        <div className="flex flex-wrap gap-2">
          {!phone && <Button type="button" variant="outline" className="min-h-9 px-3 text-sm" onClick={() => { setAdding('phone'); setValue('') }}>+ Přidat telefon</Button>}
          {!email && <Button type="button" variant="outline" className="min-h-9 px-3 text-sm" onClick={() => { setAdding('email'); setValue('') }}>+ Přidat e-mail</Button>}
        </div>
      )}

      {adding && (
        <form onSubmit={saveContact} className="flex flex-col gap-2 rounded-chip border bg-ground p-3 sm:flex-row sm:items-end dark:bg-navy-950">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor={`kontakt-${adding}-${customerId}`}>{adding === 'email' ? 'E-mail' : 'Telefon'}</Label>
            <Input
              id={`kontakt-${adding}-${customerId}`}
              type={adding === 'email' ? 'email' : 'tel'}
              inputMode={adding === 'phone' ? 'tel' : undefined}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={adding === 'email' ? 254 : 30}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !value.trim()}>Uložit</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(null)}>Zavřít</Button>
          </div>
        </form>
      )}

      {duplicate && (
        <div className="rounded-box border border-navy-100 p-3">
          <p className="mb-3 text-sm text-quiet">Tento kontakt už používá jiný zákazník. Můžete je sloučit a zachovat historii.</p>
          <MergeBox slug={slug} customerId={customerId} customerName={customerName} suggested={[duplicate]} />
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Napsat e-mail</DialogTitle>
            <DialogDescription>E-mail odešleme jménem {businessName}. Odpověď přijde na váš e-mail.</DialogDescription>
          </DialogHeader>
          {loadingTemplates ? (
            <p className="text-sm text-quiet">Načítám šablony…</p>
          ) : (
            <form onSubmit={save} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Šablona
                <select value={type} onChange={(event) => selectTemplate(event.target.value as CustomerMessageType)} className="h-11 rounded-chip border border-input bg-surface px-3 text-[15px] text-ink">
                  {CUSTOMER_MESSAGE_TYPES.map((item) => {
                    const row = templates.find((template) => template.type === item)
                    const blocked = item === 'customer_offer' && offerBlocked
                    return <option key={item} value={item} disabled={!row?.enabled || blocked}>{MESSAGES[item].label}</option>
                  })}
                </select>
              </label>
              {type === 'customer_offer' && offerBlocked && <p className="text-sm text-quiet">Nabídku můžete poslat jen zákazníkovi, který s ní souhlasil a neodhlásil se.</p>}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`predmet-zpravy-${customerId}`}>Předmět</Label>
                <Input id={`predmet-zpravy-${customerId}`} value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={150} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`text-zpravy-${customerId}`}>Text</Label>
                <textarea id={`text-zpravy-${customerId}`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={8} required className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed text-ink focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
              </div>
              {type === 'customer_offer' && <p className="rounded-chip bg-navy-50 px-3 py-2.5 text-sm text-navy-900 dark:bg-navy-800 dark:text-navy-50">V e-mailu bude odkaz pro odhlášení z dalších nabídek.</p>}
              {selectedTemplate && !selectedTemplate.enabled && <p className="text-sm text-quiet">Tuto šablonu máte vypnutou v Nastavení › Komunikace.</p>}
              <Button type="submit" disabled={pending || (type === 'customer_offer' && offerBlocked) || selectedTemplate?.enabled === false}>Odeslat</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
