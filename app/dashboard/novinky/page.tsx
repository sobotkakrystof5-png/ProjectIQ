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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Novinky</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Co je nového v ZakazIQ. Klienti ji uvidí ve zvonku po zveřejnění, e-mail odejde jen po potvrzení.
        </p>
      </div>

      <NewsEditor
        key={editing?.id ?? 'nova'}
        fontClassName={wsFontVariables}
        news={editing ? { id: editing.id, title: editing.title, body: editing.body, link: editing.link, tag: editing.tag, imageDataUrl: editing.imageDataUrl } : null}
      />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Všechny novinky</h2>
        {failed ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
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
    </div>
  )
}
