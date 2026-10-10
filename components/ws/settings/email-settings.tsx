'use client'

import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { saveEmailReplyTo, saveEmailSetting, saveNewsSetting, sendTestEmailAction } from '@/app/w/[business]/nastaveni/emaily/actions'
import { BODY_MAX, MESSAGES, SUBJECT_MAX, TEMPLATE_VARS, type MessageType } from '@/lib/ws/email/catalog'
import { previewCustomerEmail } from '@/lib/ws/email/compose'

type Row = { type: MessageType; enabled: boolean; subject: string | null; body: string | null }

/**
 * Nastavení › E-maily a upozornění (S15): přepínač u každého e-mailu, úprava
 * textu s proměnnými a živý náhled. Náhled skládá stejná funkce jako
 * odeslaný e-mail (lib/ws/email/compose.ts), jen s ukázkovými údaji.
 */
export function EmailSettings({
  slug,
  brand,
  rows,
  replyTo,
  ownerEmail,
  newsEmails,
  readOnly,
  portal = false,
}: {
  slug: string
  brand: { name: string; color: string | null }
  portal?: boolean
  rows: Row[]
  replyTo: string | null
  ownerEmail: string | null
  newsEmails: boolean
  readOnly: boolean
}) {
  const { run, pending } = useWsAction()
  const [open, setOpen] = useState<MessageType | null>(null)
  const [reply, setReply] = useState(replyTo ?? '')
  const customer = rows.filter((r) => MESSAGES[r.type].audience === 'customer')
  const owner = rows.filter((r) => MESSAGES[r.type].audience === 'owner')

  const toggle = (r: Row, enabled: boolean) =>
    run(
      () => saveEmailSetting({ slug, type: r.type, enabled, subject: r.subject, body: r.body }),
      () => toast.success(enabled ? 'Zapnuto.' : 'Vypnuto. Tenhle e-mail nebude odcházet.'),
    )

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="emaily-odpovedi">
        <h2 id="emaily-odpovedi" className="text-[18px] font-semibold text-ink">
          Odpovědi zákazníků
        </h2>
        <p className="text-sm text-quiet">
          E-maily odcházejí se jménem {brand.name}. Když zákazník odpoví, odpověď přijde sem.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => saveEmailReplyTo({ slug, email: reply }), () => toast.success('Uloženo.'))
          }}
        >
          <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <Label htmlFor="emaily-reply">E-mail pro odpovědi</Label>
            <Input id="emaily-reply" type="email" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={ownerEmail ?? 'vas@email.cz'} maxLength={254} disabled={readOnly} />
          </div>
          <Button type="submit" variant="outline" disabled={pending || readOnly}>
            Uložit
          </Button>
        </form>
        {!reply && ownerEmail && <p className="text-sm text-quiet">Bez vyplnění chodí odpovědi na {ownerEmail}.</p>}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="emaily-zakaznikum">
        <h2 id="emaily-zakaznikum" className="text-[18px] font-semibold text-ink">
          Zákazníkům
        </h2>
        <ul className="flex flex-col gap-3">
          {customer.map((r) => (
            <li key={r.type} className="rounded-panel border border-navy-100 bg-surface">
              <div className="flex min-h-[76px] items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <h3 className="text-[16px] font-semibold text-ink">{MESSAGES[r.type].label}</h3>
                  <p className="mt-0.5 text-sm text-quiet">{MESSAGES[r.type].when}</p>
                  <button
                    type="button"
                    onClick={() => setOpen(open === r.type ? null : r.type)}
                    aria-expanded={open === r.type}
                    className="-ml-1 mt-1 inline-flex min-h-11 items-center rounded-full px-1 text-sm font-semibold text-navy-700 underline-offset-4 hover:underline"
                  >
                    {open === r.type ? 'Zavřít' : r.subject || r.body ? 'Upravit text (upravený)' : 'Upravit text'}
                  </button>
                </div>
                <Switch checked={r.enabled} disabled={readOnly || pending} aria-label={MESSAGES[r.type].label} onCheckedChange={(v) => void toggle(r, v)} />
              </div>
              {open === r.type && <Editor slug={slug} brand={brand} portal={portal} row={r} readOnly={readOnly} onDone={() => setOpen(null)} />}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="emaily-vam">
        <h2 id="emaily-vam" className="text-[18px] font-semibold text-ink">
          Vám
        </h2>
        <p className="text-sm text-quiet">Upozornění na platbu předplatného chodí vždy.</p>
        <ul className="flex flex-col gap-3">
          {owner.map((r) => (
            <li key={r.type} className="flex min-h-[76px] items-center justify-between gap-4 rounded-panel border border-navy-100 bg-surface px-5 py-4">
              <div>
                <h3 className="text-[16px] font-semibold text-ink">{MESSAGES[r.type].label}</h3>
                <p className="mt-0.5 text-sm text-quiet">{MESSAGES[r.type].when}</p>
              </div>
              <Switch checked={r.enabled} disabled={readOnly || pending} aria-label={MESSAGES[r.type].label} onCheckedChange={(v) => void toggle(r, v)} />
            </li>
          ))}
          <li className="flex min-h-[76px] items-center justify-between gap-4 rounded-panel border border-navy-100 bg-surface px-5 py-4">
            <div>
              <h3 className="text-[16px] font-semibold text-ink">Novinky ZakazIQ</h3>
              <p className="mt-0.5 text-sm text-quiet">Co jsme v aplikaci vylepšili, jednou za čas</p>
            </div>
            <Switch
              checked={newsEmails}
              disabled={readOnly || pending}
              aria-label="Novinky ZakazIQ"
              onCheckedChange={(v) => void run(() => saveNewsSetting({ slug, enabled: v }), () => toast.success(v ? 'Novinky budou chodit.' : 'Novinky už chodit nebudou.'))}
            />
          </li>
        </ul>
      </section>
    </div>
  )
}

function Editor({
  slug,
  brand,
  portal,
  row,
  readOnly,
  onDone,
}: {
  slug: string
  brand: { name: string; color: string | null }
  portal: boolean
  row: Row
  readOnly: boolean
  onDone: () => void
}) {
  const def = MESSAGES[row.type]
  const { run, pending } = useWsAction()
  const [subject, setSubject] = useState(row.subject ?? def.subject)
  const [body, setBody] = useState(row.body ?? def.body)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const preview = useMemo(() => previewCustomerEmail({ type: row.type, brand, subject, body, portal }), [row.type, brand, subject, body, portal])
  const custom = subject !== def.subject || body !== def.body

  const insert = (key: string) => {
    const el = bodyRef.current
    const token = `{${key}}`
    if (!el) return setBody((b) => b + token)
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    setBody(body.slice(0, start) + token + body.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <div className="grid gap-5 border-t border-navy-100 px-5 py-5 lg:grid-cols-2">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => saveEmailSetting({ slug, type: row.type, enabled: row.enabled, subject, body }), () => {
            toast.success('Text je uložený.')
            onDone()
          })
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`predmet-${row.type}`}>Předmět</Label>
          <Input id={`predmet-${row.type}`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={SUBJECT_MAX} required disabled={readOnly} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`text-${row.type}`}>Text</Label>
          <textarea
            id={`text-${row.type}`}
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={BODY_MAX}
            rows={9}
            required
            disabled={readOnly}
            className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-quiet">Doplnit do textu:</p>
          <div className="flex flex-wrap gap-2">
            {def.vars.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => insert(key)}
                disabled={readOnly}
                className="inline-flex min-h-11 items-center rounded-full bg-navy-50 px-3 text-sm text-navy-900 transition-colors hover:bg-navy-100 disabled:opacity-50"
              >
                {TEMPLATE_VARS[key]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || readOnly}>
            Uložit text
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void run(() => sendTestEmailAction({ slug, type: row.type, subject, body }), (r) => toast.success(r.message))}
          >
            Poslat si zkušební
          </Button>
          {custom && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending || readOnly}
              onClick={() => {
                setSubject(def.subject)
                setBody(def.body)
              }}
            >
              Původní text
            </Button>
          )}
        </div>
      </form>
      <div className="flex flex-col gap-2">
        <p className="font-num text-[11px] uppercase tracking-[0.08em] text-quiet">Náhled s ukázkovými údaji</p>
        <p className="text-sm text-ink">
          <span className="text-quiet">Předmět: </span>
          {preview.subject}
        </p>
        <iframe title={`Náhled e-mailu ${def.label}`} sandbox="" srcDoc={preview.html} className="h-[560px] w-full rounded-chip border border-navy-100 bg-ground" />
      </div>
    </div>
  )
}
