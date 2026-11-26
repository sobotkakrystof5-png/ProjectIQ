import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { EmptyState } from '@/components/ws/brand'
import { Card, CardHead } from '@/components/admin/card'
import { VoiceDevicesPanel } from '@/components/admin/voice/devices-panel'
import { VoiceDictionaryPanel } from '@/components/admin/voice/dictionary-panel'
import { VoiceHistoryView } from '@/components/admin/voice/history'
import { VoiceLearningPanel } from '@/components/admin/voice/learning-panel'
import { RunLearningButton } from '@/components/admin/voice/run-learning'
import { VoiceOverviewView } from '@/components/admin/voice/overview'
import { VoiceDeleteCard, VoiceSettingsForm } from '@/components/admin/voice/settings-panel'
import { isVoiceKeyConfigured } from '@/lib/admin/voice/keys'
import { isDictationStatus } from '@/lib/admin/voice/labels'
import {
  SEARCH_MAX,
  loadVoiceDictionary,
  loadVoiceHistory,
  loadVoiceLearning,
  loadVoiceOverview,
  loadVoiceSettingsTab,
  type HistoryFilter,
} from '@/lib/admin/voice/queries'
import { requireAuth } from '@/lib/auth'

export const metadata: Metadata = { title: 'ZakazIQ Voice' }
export const dynamic = 'force-dynamic'

/**
 * ZakazIQ Voice (R-148, VO10): Přehled · Historie · Učení · Slovník · Nastavení.
 * Záložka v adrese (`?tab=`), každá záložka čte jednou dávkou (R-092).
 */

const PATH = '/dashboard/voice'
const TABS = [
  { key: 'prehled', label: 'Přehled' },
  { key: 'historie', label: 'Historie' },
  { key: 'uceni', label: 'Učení' },
  { key: 'slovnik', label: 'Slovník' },
  { key: 'nastaveni', label: 'Nastavení' },
] as const
type Tab = (typeof TABS)[number]['key']

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

function MissingTables() {
  return (
    <Card>
      <p className="text-sm text-quiet">
        Databáze ještě nemá tabulky ZakazIQ Voice. Až proběhne migrace 136, uvidíte tady diktáty, slovník a nastavení.
      </p>
    </Card>
  )
}

async function tabContent(tab: Tab, filter: HistoryFilter): Promise<{ body: React.ReactNode; pending: number | null }> {
  switch (tab) {
    case 'historie': {
      const res = await loadVoiceHistory(filter)
      if (!res.ok) return { body: <MissingTables />, pending: null }
      return {
        pending: res.pending,
        body: <VoiceHistoryView items={res.data.items} matching={res.data.matching} filter={filter} storeText={res.data.storeText} />,
      }
    }
    case 'uceni': {
      const res = await loadVoiceLearning()
      if (!res.ok) return { body: <MissingTables />, pending: null }
      return { pending: res.pending, body: <VoiceLearningPanel data={res.data} runNow={<RunLearningButton />} /> }
    }
    case 'slovnik': {
      const res = await loadVoiceDictionary()
      if (!res.ok) return { body: <MissingTables />, pending: null }
      return { pending: res.pending, body: <VoiceDictionaryPanel data={res.data} /> }
    }
    case 'nastaveni': {
      const res = await loadVoiceSettingsTab()
      if (!res.ok) return { body: <MissingTables />, pending: null }
      return {
        pending: res.pending,
        body: (
          <div className="flex min-w-0 flex-col gap-4">
            <Card id="zarizeni">
              <CardHead
                title="Zařízení"
                hint="Každý Mac má vlastní klíč. Klíč umí jen posílat diktáty a číst slovník, nic jiného v administraci."
              />
              <VoiceDevicesPanel devices={res.data.devices} configured={isVoiceKeyConfigured()} />
            </Card>
            <VoiceSettingsForm settings={res.data.settings} />
            <VoiceDeleteCard dictations={res.data.dictations} />
          </div>
        ),
      }
    }
    default: {
      const res = await loadVoiceOverview()
      if (!res.ok) return { body: <MissingTables />, pending: null }
      const o = res.data
      const empty = o.total.dictations === 0 && o.todayWords === 0
      return {
        pending: res.pending,
        body: empty ? (
          <EmptyState
            title="Zatím žádný diktát"
            description="Podržte fn na Macu a začněte mluvit. Nejdřív přidejte Mac v Nastavení, dostane klíč pro aplikaci."
            action={
              <Link
                href={`${PATH}?tab=nastaveni#zarizeni`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white hover:bg-navy-800"
              >
                Přidat Mac
              </Link>
            }
          />
        ) : (
          <VoiceOverviewView o={o} />
        ),
      }
    }
  }
}

export default async function VoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAuth()
  const params = await searchParams
  const rawTab = one(params.tab)
  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : 'prehled'
  const query = (one(params.hledat) ?? '').replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX) || null
  const status = one(params.stav)
  const filter: HistoryFilter = { query, status: isDictationStatus(status) ? status : null }

  const { body, pending } = await tabContent(tab, filter)

  return (
    <PageShell width="wide">
      <PageHeader
        title="ZakazIQ Voice"
        subtitle="Diktování na Macu: podržíte fn, mluvíte, pustíte a text se vloží."
        subtitleFont="sans"
      />
      <PillNav
        label="Části ZakazIQ Voice"
        variant="segmented"
        className="self-start"
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: t.key === 'prehled' ? PATH : `${PATH}?tab=${t.key}`,
          active: t.key === tab,
          count: t.key === 'uceni' && pending ? pending : undefined,
        }))}
      />
      {body}
    </PageShell>
  )
}
