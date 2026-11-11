import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { z } from 'zod'
import { getNewsItem, listNews } from '@/lib/ws/admin/news'
import { wsFontVariables } from '@/lib/ws/fonts'
import { NewsEditor } from './editor'
import { NewsList } from './news-list'

// Novinky ZakazIQ pro klienty Workspace (S17). Admin layout ověřil NextAuth
// session, akce si ji ověřují znovu. Novinka se ukáže ve zvonku „Co je nového“
// po zveřejnění, e-mailem jen po výslovném „Poslat e-mailem všem“.

export const dynamic = 'force-dynamic'

export default async function NovinkyPage(props: { searchParams: Promise<{ upravit?: string }> }) {
  const searchParams = await props.searchParams
  const editId = z.string().uuid().safeParse(searchParams.upravit)
  let failed = false
  const [items, editing] = await Promise.all([
    listNews().catch((e) => {
      failed = true
      console.error('admin.novinky', { error: e instanceof Error ? e.message : 'unknown' })
      return []
    }),
    editId.success ? getNewsItem(editId.data).catch(() => null) : Promise.resolve(null),
  ])

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Novinky"
        subtitle="Co je nového v ZakazIQ. Klienti novinku uvidí ve zvonku po zveřejnění, e-mail odejde jen po potvrzení."
        subtitleFont="sans"
      />

      <NewsEditor
        key={editing?.id ?? 'nova'}
        fontClassName={wsFontVariables}
        news={editing ? { id: editing.id, title: editing.title, body: editing.body, link: editing.link, tag: editing.tag, imageDataUrl: editing.imageDataUrl } : null}
      />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Všechny novinky</h2>
        {failed ? (
          <div className="rounded-chip border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            Novinky se nepodařilo načíst. Je aplikovaná migrace 083?
          </div>
        ) : (
          <NewsList
            items={items.map((n) => ({
              id: n.id,
              title: n.title,
              tag: n.tag,
              publishedAt: n.publishedAt?.toISOString() ?? null,
              emailedAt: n.emailedAt?.toISOString() ?? null,
              emailRecipients: n.emailRecipients,
            }))}
          />
        )}
      </div>
    </PageShell>
  )
}
