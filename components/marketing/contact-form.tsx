'use client'

import { useActionState, useEffect, useRef } from 'react'
import { submitContactForm, type ContactFormState } from '../../app/(marketing)/actions'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from './content'

const inputClass = 'mt-2 min-h-[50px] w-full rounded-chip border border-navy-100 bg-surface px-4 text-base text-ink outline-none transition focus:border-navy-500 focus:ring-2 focus:ring-navy-100'
const initialContactFormState: ContactFormState = { status: 'idle', message: '' }

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContactForm, initialContactFormState)
  const startedAt = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (startedAt.current) startedAt.current.value = String(Date.now())
  }, [])

  return (
    <form action={formAction} className="flex flex-col gap-5" aria-describedby="contact-privacy">
      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="contact-company-website">Nechte prázdné</label>
        <input id="contact-company-website" name="company_website" tabIndex={-1} autoComplete="off" />
      </div>
      <input ref={startedAt} name="form_started_at" type="hidden" defaultValue="" />

      <label className="block text-[15px] font-medium text-ink">
        Vaše jméno
        <input className={inputClass} name="name" autoComplete="name" minLength={2} maxLength={120} required />
      </label>

      <label className="block text-[15px] font-medium text-ink">
        E-mail
        <input className={inputClass} name="email" type="email" autoComplete="email" maxLength={254} required />
      </label>

      <label className="block text-[15px] font-medium text-ink">
        S čím vám můžeme pomoct?
        <textarea className={`${inputClass} min-h-32 resize-y py-3`} name="message" minLength={3} maxLength={3000} rows={5} required />
      </label>

      <p id="contact-privacy" className="text-sm leading-relaxed text-quiet">
        Jméno a e-mail použijeme jen k odpovědi na váš dotaz. Můžete nám také napsat na{' '}
        <a href={SUPPORT_MAILTO} className="text-navy-700 underline underline-offset-4 hover:text-navy-900">{SUPPORT_EMAIL}</a>.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-navy-700 px-6 text-base font-semibold text-white transition-colors hover:bg-navy-800 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? 'Odesílám…' : 'Odeslat dotaz'}
        </button>
        <p className="text-sm text-quiet">Ozveme se do 24 hodin.</p>
      </div>

      {state.message ? (
        <p role={state.status === 'error' ? 'alert' : 'status'} aria-live="polite" className={state.status === 'error' ? 'text-sm text-danger' : 'text-sm font-medium text-navy-800'}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
