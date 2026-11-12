'use client'

import { Copy, Mail, MessageCircle, MessageSquare, Phone, PenLine } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { formatPhone, mailtoHref, smsHref, telHref, whatsappHref } from '@/lib/contacts/href'
import { templatesFor, type MessageContext, type MessageTemplate } from '@/lib/message-templates'
import { cn } from '@/lib/utils'

/**
 * Zavolat, napsat SMS, e-mail nebo WhatsApp — jedním klikem a bez opisování
 * (AD10). Jedna komponenta pro detail zakázky, Hovory, kalendář, poptávky
 * i faktury; dřív měla každá obrazovka vlastní `tel:` odkaz (nebo žádný).
 *
 * Šablony **jen plní odkaz**, nic neposílají (R-084): otevře se poštovní
 * klient nebo telefon s předepsaným textem, odeslání zůstává na člověku.
 *
 * Plochy mají 44 px (Dílky). „Zkopírovat" je záloha pro počítač, kde `tel:`
 * nemusí nic otevřít.
 */

export type ContactActionsProps = {
  phone?: string | null
  email?: string | null
  /** Kontext pro šablony (termín, název zakázky, odkaz na přehled). */
  context?: MessageContext
  /** `row` = tlačítka s popiskem, `compact` = jen ikony (tabulky, karty). */
  variant?: 'row' | 'compact'
  /** Co se ukáže, když kontakt nemá telefon ani e-mail. */
  emptyHint?: string
  className?: string
}

const PILL =
  'inline-flex min-h-11 items-center gap-2 rounded-chip border border-navy-100 bg-surface px-3 text-sm font-medium ' +
  'text-navy-700 transition-colors hover:bg-navy-50 hover:text-navy-800 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-navy-700 focus-visible:ring-offset-1'

const ICON_ONLY =
  'inline-flex h-11 w-11 items-center justify-center rounded-chip text-navy-700 transition-colors ' +
  'hover:bg-navy-50 hover:text-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700'

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success('Zkopírováno', { description: label })
  } catch {
    toast.error('Zkopírovat se nepovedlo', { description: 'Označte text a zkopírujte ho ručně.' })
  }
}

/** Odkaz šablony podle kanálu; `null` = v tomhle kanálu šablona nejde. */
function templateHref(
  template: MessageTemplate,
  ctx: MessageContext,
  contact: { phone?: string | null; email?: string | null },
): string | null {
  const body = template.body(ctx)
  if (template.channel === 'sms') return smsHref(contact.phone, body)
  if (template.channel === 'whatsapp') return whatsappHref(contact.phone, body)
  return mailtoHref(contact.email, { subject: template.subject?.(ctx) ?? null, body })
}

export function ContactActions({
  phone,
  email,
  context = {},
  variant = 'row',
  emptyHint,
  className,
}: ContactActionsProps) {
  const tel = telHref(phone)
  const sms = smsHref(phone)
  const mail = mailtoHref(email)
  const whatsapp = whatsappHref(phone)
  const readablePhone = formatPhone(phone)

  const templates = (['sms', 'whatsapp', 'email'] as const).flatMap((channel) =>
    templatesFor(channel, context)
      .map((template) => ({ template, href: templateHref(template, context, { phone, email }) }))
      .filter((x): x is { template: MessageTemplate; href: string } => x.href !== null),
  )

  if (tel === null && mail === null) {
    return emptyHint ? <p className={cn('text-sm text-quiet', className)}>{emptyHint}</p> : null
  }

  const compact = variant === 'compact'
  const cls = compact ? ICON_ONLY : PILL
  const size = compact ? 18 : 15

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {tel && (
        <a href={tel} className={cls} aria-label={readablePhone ? `Zavolat na ${readablePhone}` : 'Zavolat'}>
          <Phone size={size} strokeWidth={1.5} aria-hidden />
          {!compact && (readablePhone ?? 'Zavolat')}
        </a>
      )}
      {sms && (
        <a href={sms} className={cls} aria-label="Napsat SMS">
          <MessageSquare size={size} strokeWidth={1.5} aria-hidden />
          {!compact && 'SMS'}
        </a>
      )}
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={cls}
          aria-label="Napsat na WhatsApp"
        >
          <MessageCircle size={size} strokeWidth={1.5} aria-hidden />
          {!compact && 'WhatsApp'}
        </a>
      )}
      {mail && (
        <a href={mail} className={cls} aria-label={email ? `Napsat e-mail na ${email}` : 'Napsat e-mail'}>
          <Mail size={size} strokeWidth={1.5} aria-hidden />
          {!compact && <span className="max-w-[220px] truncate">{email}</span>}
        </a>
      )}

      {templates.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={cls} aria-label="Napsat podle šablony">
            <PenLine size={size} strokeWidth={1.5} aria-hidden />
            {!compact && 'Podle šablony'}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Otevře zprávu s předepsaným textem</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {templates.map(({ template, href }) => (
              <DropdownMenuItem key={template.id} asChild>
                <a href={href} {...(template.channel === 'whatsapp' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  {template.channel === 'email' ? (
                    <Mail size={18} strokeWidth={1.5} aria-hidden />
                  ) : template.channel === 'whatsapp' ? (
                    <MessageCircle size={18} strokeWidth={1.5} aria-hidden />
                  ) : (
                    <MessageSquare size={18} strokeWidth={1.5} aria-hidden />
                  )}
                  {template.label}
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {(readablePhone || email) && (
        <button
          type="button"
          onClick={() => {
            const value = readablePhone ?? email ?? ''
            void copy(value, value)
          }}
          className={compact ? ICON_ONLY : PILL}
          aria-label="Zkopírovat kontakt"
          title="Zkopírovat kontakt"
        >
          <Copy size={size} strokeWidth={1.5} aria-hidden />
          {!compact && 'Zkopírovat'}
        </button>
      )}
    </div>
  )
}
