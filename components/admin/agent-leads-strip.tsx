'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/ws/brand'
import { toast } from '@/components/ui/toast'
import { ContactActions } from '@/components/admin/contact-actions'
import {
  convertAgentLeadToCall,
  convertAgentLeadToProject,
  dismissAgentLead,
  restoreAgentLead,
} from '@/app/agent-leads-actions'
import { AGENT_LEAD_PRIORITY_LABEL, AGENT_LEAD_PRIORITY_TONE, toneVariant } from '@/lib/admin-status'
import { formatDateTime } from '@/lib/utils'
import type { AgentLeadRow } from '@/lib/admin/agent-leads'

/**
 * Pruh AI leadů nad Hovory (AD16).
 *
 * Leady z vizeon-lead-agent se od migrace 052 ukládaly a nikdo je neviděl.
 * Tady jsou seřazené podle skóre, s prioritou a shrnutím — a jde z nich
 * udělat kontakt nebo rovnou zakázku **stejnou cestou jako z ostatních**.
 *
 * `Shrnutí` a `Jak s ním mluvit` jsou odhad modelu o skutečném člověku.
 * Vykreslují se jako text (React escapuje sám), nikdy jako HTML, a klientovi
 * se neposílají.
 */
export function AgentLeadsStrip({ rows, total }: { rows: AgentLeadRow[]; total: number }) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (rows.length === 0) return null

  return (
    <section aria-label="Leady od AI" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel as="h2" className="flex items-center gap-2">
          <Bot size={15} strokeWidth={1.5} aria-hidden="true" />
          Poptávky od AI agenta
        </SectionLabel>
        <p className="text-xs text-quiet">
          {total === 1 ? '1 čeká na vyřízení' : `${total} čeká na vyřízení`}
          {total > rows.length && ` · ukazuje se ${rows.length} s nejvyšším skóre`}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <AgentLeadItem
            key={row.id}
            row={row}
            open={openId === row.id}
            onToggle={() => setOpenId(openId === row.id ? null : row.id)}
          />
        ))}
      </ul>
    </section>
  )
}

function AgentLeadItem({ row, open, onToggle }: { row: AgentLeadRow; open: boolean; onToggle: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const doHovoru = () =>
    start(async () => {
      const result = await convertAgentLeadToCall(row.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Přepsáno do Hovorů.')
      router.push(`/dashboard/calls?lead=${result.leadId}`)
    })

  const doZakazky = () =>
    start(async () => {
      const result = await convertAgentLeadToProject(row.id)
      // Při úspěchu akce přesměruje na novou zakázku a sem se nevrátí.
      if (!result.ok) toast.error(result.error)
    })

  const odlozit = () =>
    start(async () => {
      await dismissAgentLead(row.id)
      toast.success('Lead je vyřízený.', {
        description: 'Z pruhu zmizel, v databázi zůstal.',
        undo: () => start(async () => void (await restoreAgentLead(row.id))),
      })
      router.refresh()
    })

  return (
    <li className="overflow-hidden rounded-box border border-navy-100 bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-navy-50"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="font-num shrink-0 text-lg font-semibold text-navy-800">{row.score}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">
              {row.clientCompany ? `${row.clientName} — ${row.clientCompany}` : row.clientName}
            </span>
            <span className="block truncate text-xs text-quiet">
              {row.clientService}
              {row.clientBudget ? ` · ${row.clientBudget}` : ''}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge variant={toneVariant(AGENT_LEAD_PRIORITY_TONE[row.priority])}>
            {AGENT_LEAD_PRIORITY_LABEL[row.priority]}
          </Badge>
          {open ? (
            <ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" className="text-quiet" />
          ) : (
            <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" className="text-quiet" />
          )}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-navy-100 px-4 py-4">
          <ContactActions
            phone={row.clientPhone}
            email={row.clientEmail}
            context={{ projectName: row.clientService }}
          />

          {row.clientMessage && (
            <div>
              <SectionLabel as="h3">Co napsal do formuláře</SectionLabel>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{row.clientMessage}</p>
            </div>
          )}

          <div>
            <SectionLabel as="h3">Shrnutí od AI</SectionLabel>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{row.summary}</p>
            <p className="mt-1 text-xs text-quiet">Odhad modelu, ne ověřený fakt. Klientovi to neposílejte.</p>
          </div>

          {(row.strategy.tone || row.strategy.style || row.strategy.focus?.length || row.strategy.avoid?.length) && (
            <div>
              <SectionLabel as="h3">Jak s ním mluvit (návrh AI)</SectionLabel>
              <dl className="mt-1 flex flex-col gap-1 text-sm text-ink">
                {row.strategy.tone && <Line label="Tón" value={row.strategy.tone} />}
                {row.strategy.style && <Line label="Styl" value={row.strategy.style} />}
                {row.strategy.focus?.length ? <Line label="Zmínit" value={row.strategy.focus.join(', ')} /> : null}
                {row.strategy.avoid?.length ? <Line label="Vynechat" value={row.strategy.avoid.join(', ')} /> : null}
              </dl>
            </div>
          )}

          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-quiet">
            {row.industry && <Line label="Obor" value={row.industry} small />}
            {row.companyType && <Line label="Typ firmy" value={row.companyType} small />}
            {row.clientDeadline && <Line label="Termín podle klienta" value={row.clientDeadline} small />}
            <Line label="Přišlo" value={formatDateTime(row.receivedAt)} small />
          </dl>

          <div className="flex flex-wrap items-center gap-2 border-t border-navy-100 pt-3">
            <Button type="button" onClick={doZakazky} disabled={pending}>
              Udělat zakázku
            </Button>
            <Button type="button" variant="outline" onClick={doHovoru} disabled={pending}>
              Přepsat do Hovorů
            </Button>
            <Button type="button" variant="ghost" onClick={odlozit} disabled={pending}>
              Nezajímavé
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function Line({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={small ? 'flex items-baseline gap-1.5' : 'flex flex-wrap items-baseline gap-2'}>
      <dt className="text-xs font-medium text-quiet">{label}:</dt>
      <dd className={small ? 'text-xs text-quiet' : 'text-sm text-ink'}>{value}</dd>
    </div>
  )
}
