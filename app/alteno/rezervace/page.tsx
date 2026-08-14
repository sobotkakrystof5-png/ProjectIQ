import { sql } from '@/lib/db'
import { Inbox } from 'lucide-react'
import { BookingCard, type WebBooking } from '@/components/BookingCard'

async function loadBookings(): Promise<WebBooking[]> {
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
    WHERE p.business = 'alteno'
      AND is_alteno_pending(p.source, p.alteno_confirmed)
    ORDER BY p.created_at DESC
  `
  return rows as WebBooking[]
}

export default async function AltenoRezervacePage() {
  const bookings = await loadBookings()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Alteno Rezervace</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Poptávky z alteno.cz čekající na potvrzení — po potvrzení se přesunou do zakázek
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
            <Inbox size={24} strokeWidth={1.5} className="text-amber-400" />
          </div>
          <p className="font-medium text-foreground mb-1">Žádné čekající rezervace</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Nové poptávky z alteno.cz se automaticky objeví zde.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {bookings.map(b => (
            <BookingCard key={b.id} booking={b} business="alteno" />
          ))}
        </div>
      )}
    </div>
  )
}
