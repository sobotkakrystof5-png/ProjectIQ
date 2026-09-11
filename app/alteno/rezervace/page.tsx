import { Inbox } from 'lucide-react'
import { BookingCard } from '@/components/BookingCard'
import { loadPendingBookings } from '@/lib/web-booking'

export default async function AltenoRezervacePage() {
  const bookings = await loadPendingBookings('alteno')

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
