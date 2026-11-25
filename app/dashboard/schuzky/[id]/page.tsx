import { notFound } from 'next/navigation'
import { MeetingDetailView } from '@/components/admin/meeting-notes/meeting-detail'
import { loadMeetingNote } from '@/lib/admin/meeting-notes/store'
import { googleStatus } from '@/lib/admin/google/oauth'
import { gmailDraftsUrl } from '@/lib/admin/google/gmail'

// Detail schůzky (R-144). Vykreslení je v `MeetingDetailView`.

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function SchuzkaPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pohled?: string }>
}) {
  const { id } = await props.params
  const { pohled } = await props.searchParams
  if (!UUID.test(id)) notFound()

  let note
  try {
    note = await loadMeetingNote(id)
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') notFound()
    throw err
  }
  if (note === null) notFound()

  const google = await googleStatus().catch(() => null)
  const draftsUrl = gmailDraftsUrl(google && 'email' in google ? google.email : null)
  return <MeetingDetailView note={note} tab={pohled === 'prepis' ? 'prepis' : 'shrnuti'} draftsUrl={draftsUrl} />
}
