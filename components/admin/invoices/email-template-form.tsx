'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { CARD_CLASS, SECTION_LABEL } from '@/components/admin/card'
import { cn } from '@/lib/utils'
import { saveInvoiceEmail } from '@/app/dashboard/finance/invoice-actions'
import {
  DEFAULT_INVOICE_EMAIL_TEMPLATE,
  EXAMPLE_INVOICE_EMAIL_VALUES,
  INVOICE_EMAIL_VARIABLES,
  invoiceEmailTemplateSchema,
  renderInvoiceEmail,
  type InvoiceEmailTemplate,
} from '@/lib/admin/invoice-email-template'

/**
 * Text e-mailu, kterým faktura odchází klientovi (R-139).
 *
 * Náhled počítá tytéž funkce jako server při odeslání, jen s ukázkovými
 * údaji — to, co tu vidíte, je to, co klient dostane. Proměnné se vkládají
 * tlačítky na místo kurzoru, aby se nemusely psát ručně (a nepřeklepávaly).
 */

type Field = 'subject' | 'body'

export function InvoiceEmailTemplateForm({ initial }: { initial: InvoiceEmailTemplate }) {
  const [saved, setSaved] = useState(initial)
  const [subject, setSubject] = useState(initial.subject)
  const [body, setBody] = useState(initial.body)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  // Kam se vloží proměnná: do pole, ve kterém se naposledy psalo. Dokud se
  // nikam neklikne, na konec textu.
  const lastField = useRef<Field | null>(null)

  const validation = invoiceEmailTemplateSchema.safeParse({ subject, body })
  const problem = validation.success ? null : (validation.error.issues[0]?.message ?? null)
  const dirty = subject !== saved.subject || body !== saved.body
  const preview = renderInvoiceEmail({ subject, body }, EXAMPLE_INVOICE_EMAIL_VALUES)

  const insert = (key: string) => {
    const token = `{${key}}`
    const field: Field = lastField.current ?? 'body'
    const element = field === 'subject' ? subjectRef.current : bodyRef.current
    const value = field === 'subject' ? subject : body
    const hasCaret = lastField.current !== null && element !== null
    const start = hasCaret ? (element?.selectionStart ?? value.length) : value.length
    const end = hasCaret ? (element?.selectionEnd ?? value.length) : value.length
    const next = value.slice(0, start) + token + value.slice(end)
    if (field === 'subject') setSubject(next)
    else setBody(next)
    const caret = start + token.length
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(caret, caret)
    })
  }

  const save = () => {
    setError(null)
    if (!validation.success) {
      setError(problem)
      return
    }
    const data = validation.data
    start(async () => {
      const result = await saveInvoiceEmail(data)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(data)
      setSubject(data.subject)
      setBody(data.body)
      toast.success('Text e-mailu uložený')
    })
  }

  return (
    <form
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={event => {
        event.preventDefault()
        save()
      }}
    >
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Předmět</span>
        <Input
          ref={subjectRef}
          value={subject}
          maxLength={200}
          onChange={e => setSubject(e.target.value)}
          onFocus={() => (lastField.current = 'subject')}
          required
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Text e-mailu</span>
        <textarea
          ref={bodyRef}
          value={body}
          maxLength={4000}
          onChange={e => setBody(e.target.value)}
          onFocus={() => (lastField.current = 'body')}
          required
          className={cn(
            'min-h-56 w-full resize-y rounded-chip border border-input bg-surface px-3.5 py-3 text-[15px] leading-relaxed text-ink transition-colors placeholder:text-quiet',
            'focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          )}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">Vložit údaj z faktury</span>
        <div className="flex flex-wrap gap-2">
          {INVOICE_EMAIL_VARIABLES.map(variable => (
            <button
              key={variable.key}
              type="button"
              onClick={() => insert(variable.key)}
              className="inline-flex h-11 items-center rounded-chip border border-input bg-surface px-3.5 text-sm text-ink transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {variable.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-quiet">
          V e-mailu se nahradí skutečným údajem z faktury. Faktura v PDF jde klientovi vždy v příloze.
        </p>
      </div>

      <section className={CARD_CLASS} aria-label="Náhled e-mailu">
        <h3 className={SECTION_LABEL}>Náhled s ukázkovými údaji</h3>
        <p className="mt-3 text-sm text-quiet">Předmět</p>
        <p className="text-[15px] font-semibold text-ink">{preview.subject}</p>
        <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink">{preview.text}</p>
      </section>

      {(error ?? problem) && dirty && <p className="text-sm text-danger">{error ?? problem}</p>}
      {error && !dirty && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !dirty || !validation.success}>
          {pending ? 'Ukládám…' : 'Uložit text e-mailu'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSubject(DEFAULT_INVOICE_EMAIL_TEMPLATE.subject)
            setBody(DEFAULT_INVOICE_EMAIL_TEMPLATE.body)
          }}
        >
          Vrátit výchozí text
        </Button>
      </div>
    </form>
  )
}
