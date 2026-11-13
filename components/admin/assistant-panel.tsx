'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { applySuggestion, proposeSuggestion, rejectSuggestion, undoProposedStatus } from '@/app/ai-actions'
import { contextRefFromPath, onAssistantOpen } from '@/lib/admin/assistant-open'
import { CONFIDENCE_FLOOR, SUGGESTION_LABELS, type Suggestion } from '@/lib/ai/suggestion-schema'
import { TEXT_MAX } from '@/lib/ai/assistant-limits'
import type { ProjectStatus } from '@/lib/types'

/**
 * Pravý panel asistenta (AD14).
 *
 * Napíšete větu, asistent vrátí **vyplněný návrh** — a ten se provede až
 * po kliknutí. Nic se neuloží samo (R-084). Panel proto vždycky ukazuje,
 * co přesně se stane, co si asistent domyslel a co ve větě chybí.
 *
 * Kontext si bere z adresy: na detailu zakázky „vidí" tu zakázku, na
 * startupovém projektu ten projekt. Jinde se ptá naslepo.
 */

type Shown = { id: string | null; suggestion: Suggestion }

/** Řádky návrhu k přečtení — ne JSON, ale to, co se opravdu stane. */
function proposalLines(suggestion: Suggestion): { label: string; value: string }[] {
  const p = suggestion.proposal
  switch (p.kind) {
    case 'create_lead':
      return [
        { label: 'Kontakt', value: p.companyName },
        ...(p.contactName ? [{ label: 'Jméno', value: p.contactName }] : []),
        ...(p.phone ? [{ label: 'Telefon', value: p.phone }] : []),
        ...(p.email ? [{ label: 'E-mail', value: p.email }] : []),
        ...(p.note ? [{ label: 'Poznámka', value: p.note }] : []),
      ]
    case 'schedule_call':
      return [
        { label: 'Termín', value: p.title },
        { label: 'Kdy', value: [p.date, p.time].filter(Boolean).join(' ') || 'nedoplněno' },
        { label: 'Délka', value: `${p.durationMinutes} min` },
        ...(p.contactName ? [{ label: 'S kým', value: p.contactName }] : []),
        ...(p.phone ? [{ label: 'Telefon', value: p.phone }] : []),
      ]
    case 'update_project_status':
      return [
        { label: 'Zakázka', value: p.project.hint ?? 'z otevřené obrazovky' },
        { label: 'Nový stav', value: p.status },
      ]
    case 'create_invoice_draft':
      return [
        { label: 'Zakázka', value: p.project.hint ?? 'z otevřené obrazovky' },
        ...(p.counterpartyName ? [{ label: 'Odběratel', value: p.counterpartyName }] : []),
        ...(p.description ? [{ label: 'Za co', value: p.description }] : []),
        ...(p.amount !== null ? [{ label: 'Částka', value: String(p.amount) }] : []),
      ]
    case 'add_note':
      return [
        { label: 'Kam', value: p.target === 'project' ? 'K zakázce' : 'Ke kontaktu' },
        ...(p.ref.hint ? [{ label: 'Komu', value: p.ref.hint }] : []),
        { label: 'Text', value: p.noteText },
      ]
    case 'send_message':
      return [
        { label: 'Čím', value: p.channel === 'email' ? 'E-mailem' : p.channel === 'sms' ? 'SMS' : 'WhatsAppem' },
        // Komu to půjde, musí být vidět **vždycky**. V kontextu asistenta
        // jsou i texty, které psal klient (poznámky, požadavky z portálu),
        // a ten by mohl modelu podstrčit cizí adresu. Člověk, který potvrzuje,
        // ji tedy musí mít před očima, ne schovanou v odkazu.
        { label: 'Komu', value: (p.channel === 'email' ? p.email : p.phone) ?? 'nedoplněno' },
        ...(p.subject ? [{ label: 'Předmět', value: p.subject }] : []),
        { label: 'Text', value: p.body },
      ]
    case 'none':
      return [{ label: 'Proč', value: p.reason }]
  }
}

export function AssistantPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [shown, setShown] = useState<Shown | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [applying, setApplying] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(
    () =>
      onAssistantOpen(({ text: prefill }) => {
        setShown(null)
        setError(null)
        setText(prefill.slice(0, TEXT_MAX))
        setOpen(true)
      }),
    [],
  )

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  const ask = useCallback(() => {
    const sentence = text.trim()
    if (!sentence || pending) return
    setError(null)
    setShown(null)
    startTransition(async () => {
      const result = await proposeSuggestion({
        text: sentence,
        contextRef: contextRefFromPath(pathname),
        source: 'panel',
      })
      if (!result.ok) setError(result.error)
      else setShown({ id: result.id, suggestion: result.suggestion })
    })
  }, [text, pending, pathname])

  async function confirm() {
    if (!shown?.id || applying) return
    setApplying(true)
    try {
      const result = await applySuggestion(shown.id)
      if (!result.ok) {
        setError(result.error)
        return
      }

      const suggestionId = shown.id
      const previousStatus = result.previousStatus
      toast.success(result.message, {
        description: result.description,
        undo: previousStatus
          ? () => {
              void undoProposedStatus(suggestionId, previousStatus as ProjectStatus).then(() => router.refresh())
            }
          : undefined,
      })

      setShown(null)
      setText('')
      setOpen(false)
      // Odkaz na zprávu otevírá poštovního klienta, ne stránku adminu.
      if (result.ref.href?.startsWith('mailto:') || result.ref.href?.startsWith('sms:')) {
        window.location.href = result.ref.href
      } else if (result.ref.href?.startsWith('http')) {
        window.open(result.ref.href, '_blank', 'noopener,noreferrer')
      } else if (result.ref.href) {
        router.push(result.ref.href)
      }
      router.refresh()
    } finally {
      setApplying(false)
    }
  }

  function dismiss() {
    if (shown?.id) void rejectSuggestion(shown.id)
    setShown(null)
    setError(null)
    inputRef.current?.focus()
  }

  const suggestion = shown?.suggestion
  const kind = suggestion?.proposal.kind
  const unsure = suggestion ? suggestion.confidence < CONFIDENCE_FLOOR : false
  const canApply = Boolean(shown?.id) && kind !== undefined && kind !== 'none'

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="font-ws sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles size={18} strokeWidth={1.5} aria-hidden="true" />
            Asistent
          </SheetTitle>
          <SheetDescription>
            Napište jednou větou, co se má stát. Asistent připraví návrh — provede se až po vašem kliknutí.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div>
            <label htmlFor="asistent-veta" className="sr-only">Co se má stát</label>
            <textarea
              id="asistent-veta"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ask()
                }
              }}
              rows={3}
              maxLength={TEXT_MAX}
              placeholder="Například: zavolat Nováka ve čtvrtek ve dvě"
              className="w-full rounded-chip border border-navy-100 bg-background px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-quiet focus:ring-2 focus:ring-ring"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button type="button" onClick={ask} disabled={pending || !text.trim()}>
                {pending ? (
                  <>
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                    Přemýšlím…
                  </>
                ) : (
                  'Připravit návrh'
                )}
              </Button>
              <span className="text-xs text-quiet">Enter odešle</span>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-chip bg-danger/10 px-3 py-2 text-sm text-ink">
              {error}
            </p>
          )}

          {suggestion && kind && (
            <div className="rounded-panel border border-navy-100 bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-quiet">
                {SUGGESTION_LABELS[kind]}
              </p>

              <dl className="mt-3 space-y-2">
                {proposalLines(suggestion).map((line) => (
                  <div key={line.label} className="flex gap-3 text-sm">
                    <dt className="w-24 shrink-0 text-quiet">{line.label}</dt>
                    <dd className="min-w-0 flex-1 whitespace-pre-wrap text-ink">{line.value}</dd>
                  </div>
                ))}
              </dl>

              {suggestion.assumptions.length > 0 && (
                <div className="mt-4 border-t border-navy-100 pt-3">
                  <p className="text-xs font-semibold text-quiet">Domyslel jsem si</p>
                  <ul className="mt-1 space-y-1 text-sm text-ink">
                    {suggestion.assumptions.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {suggestion.missing.length > 0 && (
                <div className="mt-4 border-t border-navy-100 pt-3">
                  <p className="text-xs font-semibold text-quiet">Chybí doplnit</p>
                  <ul className="mt-1 space-y-1 text-sm text-ink">
                    {suggestion.missing.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {unsure && kind !== 'none' && (
                <p className="mt-4 rounded-chip bg-signal/15 px-3 py-2 text-sm text-ink">
                  Nejsem si jistý, jestli jsem to pochopil správně. Projděte si to, než to pustíte dál.
                </p>
              )}

              {!shown?.id && kind !== 'none' && (
                <p className="mt-4 rounded-chip bg-signal/15 px-3 py-2 text-sm text-ink">
                  Návrh se nepodařilo uložit, takže ho zatím nejde provést jedním klikem. Zapište to prosím ručně.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {canApply && (
                  <Button type="button" onClick={confirm} disabled={applying}>
                    {applying ? 'Provádím…' : 'Provést'}
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={dismiss}>
                  {canApply ? 'Zahodit' : 'Zavřít návrh'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
