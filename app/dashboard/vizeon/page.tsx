import { sql } from '@/lib/db'
import { Inbox } from 'lucide-react'
import { formatPragueDateTime } from '@/lib/prague-time'
import { VizeonCard } from '@/components/VizeonCard'

interface VizeonBooking {
  id: string
  client_name: string
  client_email: string | null
  client_phone: string | null
  service_type: string | null
  description: string | null
  created_at: string
  consultation_at: string | null
}

async function loadBookings(): Promise<VizeonBooking[]> {
  const rows = await sql`
    SELECT
      p.id,
      p.client_name,
      p.client_email,
      p.client_phone,
      p.service_type,
      p.description,
      p.created_at,
      ce.starts_at AS consultation_at
    FROM projects p
    LEFT JOIN calendar_events ce ON ce.project_id = p.id
    WHERE p.source = 'vizeon_web' AND (p.vizeon_confirmed = false OR p.vizeon_confirmed IS NULL)
    ORDER BY p.created_at DESC
  `
  return rows as VizeonBooking[]
}

export default async function VizeonPage() {
  const bookings = await loadBookings()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Vizeon Rezervace</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Poptávky z vizeon.cz čekající na potvrzení — po potvrzení se přesunou do zakázek
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
            <Inbox size={24} strokeWidth={1.5} className="text-brand-400" />
          </div>
          <p className="font-medium text-foreground mb-1">Žádné čekající rezervace</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Nové poptávky z vizeon.cz se automaticky objeví zde.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {bookings.map(b => (
            <VizeonCard key={b.id} booking={b} />
          ))}
        </div>
      )}
    </div>
  )
}
