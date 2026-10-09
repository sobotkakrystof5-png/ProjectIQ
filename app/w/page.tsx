import type { Metadata } from 'next'
import { AppHeader, type HeaderBusiness } from '@/components/ws/app-header'
import { AccentHeading, EmptyState, SectionLabel } from '@/components/ws/brand'
import { requireWorkspace } from '@/lib/ws/context'
import { wsDb } from '@/lib/ws/db'

export const metadata: Metadata = { title: 'Dnes' }

// Úvod aplikace. Zatím jen hlavička s přepínačem byznysů a prázdný stav —
// obrazovku Dnes a kostru aplikace (postranní panel, /w/[byznys]) postaví S09.
export default async function WorkspaceHome() {
  const ctx = await requireWorkspace()
  const businesses = await wsDb(ctx)<HeaderBusiness>`
    SELECT name, slug FROM ws.businesses
    WHERE account_id = ${ctx.accountId} AND archived_at IS NULL
    ORDER BY created_at
  `
  const current = businesses[0] ?? null

  return (
    <>
      <AppHeader businesses={businesses} activeSlug={current?.slug ?? null} />
      <main className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-8 sm:px-8 lg:py-10">
        <div className="flex flex-col gap-2">
          {current && <SectionLabel>{current.name}</SectionLabel>}
          <AccentHeading accent="je připravený.">Váš byznys</AccentHeading>
        </div>
        <EmptyState
          size="large"
          title="Přehled dne se ještě staví"
          description="Brzy tu na jeden pohled uvidíte nové poptávky, dnešní termíny a zákazníky."
        />
      </main>
    </>
  )
}
