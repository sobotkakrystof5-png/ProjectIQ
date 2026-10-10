import type { Metadata } from 'next'
import Link from 'next/link'
import { ActionLinkForm } from '@/components/ws/email/action-link-form'
import { PublicPage } from '@/components/ws/email/public-page'
import { peekActionLink } from '@/lib/ws/email/action-link'
import { formatWhen } from '@/lib/ws/email/notify'
import { addDays, pragueToday } from '@/lib/ws/time'

// Odkaz z e-mailu „Nová poptávka“ (S15). Otevření nic nemění (e-mailové
// programy odkazy načítají předem), potvrzuje až tlačítko.

export const metadata: Metadata = { title: 'Nová poptávka', referrer: 'no-referrer' }

const GONE: Record<string, { title: string; text: string }> = {
  invalid: { title: 'Odkaz neplatí', text: 'Tenhle odkaz nejde použít. Poptávku najdete v aplikaci.' },
  used: { title: 'Odkaz už je použitý', text: 'Každý odkaz z e-mailu jde použít jednou. Poptávku najdete v aplikaci.' },
  expired: { title: 'Odkaz vypršel', text: 'Odkazy z e-mailu platí 72 hodin. Poptávku najdete v aplikaci.' },
  handled: { title: 'Poptávka je vyřízená', text: 'Tuhle poptávku už někdo potvrdil nebo odmítl.' },
}

export default async function ActionLinkPage({ params, searchParams }: { params: { token: string }; searchParams: { akce?: string } }) {
  const state = await peekActionLink(params.token).catch(() => ({ ok: false, reason: 'invalid' }) as const)
  if (!state.ok) {
    const g = GONE[state.reason] ?? GONE.invalid
    return (
      <PublicPage title={g.title}>
        <p className="text-[15px] text-quiet">{g.text}</p>
        <Link href="/w" className="text-[15px] font-semibold text-navy-700 underline underline-offset-4">
          Otevřít aplikaci
        </Link>
      </PublicPage>
    )
  }
  const { request, business } = state
  const wanted = request.wantedStart ? formatWhen(request.wantedStart) : null
  const rows = [
    ['Zákazník', request.name],
    ['Služba', request.service],
    ['Chtěný termín', wanted ?? 'Bez termínu'],
    ['Zpráva', request.message],
  ].filter((r): r is [string, string] => Boolean(r[1]))
  return (
    <PublicPage title="Nová poptávka">
      <p className="text-[15px] text-quiet">{business.name}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-chip border-[1.5px] border-dashed border-signal-line bg-signal-bg px-4 py-3 text-signal-ink">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-sm">{label}</dt>
            <dd className="whitespace-pre-line text-[15px] font-semibold">{value.slice(0, 500)}</dd>
          </div>
        ))}
      </dl>
      <ActionLinkForm
        token={params.token}
        wantedLabel={wanted}
        startWithOtherTime={searchParams.akce === 'cas' || state.needsTime}
        defaultDay={addDays(pragueToday(), 1)}
      />
    </PublicPage>
  )
}
