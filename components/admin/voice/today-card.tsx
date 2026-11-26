import Link from 'next/link'
import { ArrowRight, Mic } from 'lucide-react'
import { Card, SECTION_LABEL } from '@/components/admin/card'
import type { VoiceToday } from '@/lib/admin/voice/queries'
import { formatDays, wordsNoun } from '@/lib/admin/voice/stats'
import { cn } from '@/lib/utils'

/** Diktování (ZakazIQ Voice, VO10): dnešní slova a série. Bez diktátu ani migrace 138 se neukáže. */
export function VoiceTodayCard({ voice }: { voice: VoiceToday }) {
  return (
    <Card className="min-w-0 p-5">
      <h2 className={cn(SECTION_LABEL, 'flex items-center gap-2')}>
        <span className="text-navy-500">
          <Mic size={16} strokeWidth={1.5} aria-hidden="true" />
        </span>
        Diktování dnes
      </h2>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="font-num text-2xl font-semibold leading-none text-ink">{voice.words.toLocaleString('cs-CZ')}</span>
        <span className="text-sm text-quiet">{wordsNoun(voice.words)}</span>
      </p>
      <p className="mt-1.5 text-xs text-quiet">
        {voice.streak > 0 ? (
          <>
            Série <span className="font-num text-ink">{formatDays(voice.streak)}</span> v řadě
          </>
        ) : (
          'Série skončila. Začne znovu prvním diktátem.'
        )}
      </p>
      <Link
        href="/dashboard/voice"
        className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-navy-700 hover:text-navy-900"
      >
        Otevřít ZakazIQ Voice
        <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </Card>
  )
}

