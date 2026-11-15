import { redirect } from 'next/navigation'
import { ProjectsList } from '@/components/admin/projects-list'
import { SCOPE_STATUSES } from '@/lib/admin/projects'

// Seznam rozpracovaných zakázek — jeden byznys, zakázky ze všech webů
// (AD02, R-088). Nepotvrzené poptávky tady nejsou, ty jsou v /dashboard/poptavky.
//
// Hotové a zaplacené zakázky mají od R-109 vlastní obrazovku
// /dashboard/zakazky/dokoncene. Staré adresy `?status=uzavrene|done|paid`
// (záložky, Profil, přesměrování ze zrušeného /dashboard/dokoncene, které
// prohlížeč mohl uložit jako trvalé) vedou tam.

const FINISHED_STATUSES = new Set<string>(['uzavrene', ...SCOPE_STATUSES.finished])

export default async function ProjectsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const rawStatus = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status
  if (rawStatus && FINISHED_STATUSES.has(rawStatus)) {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === 'status' || key === 'page' || value === undefined) continue
      for (const v of Array.isArray(value) ? value : [value]) next.append(key, v)
    }
    if (rawStatus !== 'uzavrene') next.set('status', rawStatus)
    const query = next.toString()
    redirect(`/dashboard/zakazky/dokoncene${query ? `?${query}` : ''}`)
  }
  return <ProjectsList scope="active" searchParams={searchParams} />
}
