import { sql } from '@/lib/db'
import type { ProjectActivityRow } from '@/lib/project-activity'
import type { ActivityItem } from '@/components/ProjectActivityPanel'

const iso = (value: Date | string | null): string | null => (value ? new Date(value).toISOString() : null)

/**
 * Aktivita zakázky pro admina (koncepty, publikované, zamítnuté se nevrací).
 * Tabulka vzniká migrací 093; do jejího nasazení stránka zakázky nesmí spadnout.
 */
export async function loadProjectActivity(projectId: string): Promise<ActivityItem[]> {
  try {
    const rows = (await sql`
      SELECT id, project_id, status, source, kind, title, body, contains_sensitive,
             created_at, updated_at, published_at, published_by
      FROM project_activity
      WHERE project_id = ${projectId} AND status <> 'rejected'
      ORDER BY coalesce(published_at, created_at) DESC
      LIMIT 100
    `) as ProjectActivityRow[]
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      source: row.source,
      kind: row.kind,
      title: row.title,
      body: row.body,
      containsSensitive: row.contains_sensitive,
      createdAt: iso(row.created_at) ?? '',
      publishedAt: iso(row.published_at),
    }))
  } catch {
    return []
  }
}
