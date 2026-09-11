import { Inbox } from 'lucide-react'
import { BookingCard } from '@/components/BookingCard'
import { loadPendingBookings } from '@/lib/web-booking'

export default async function VizeonPage() {
  const bookings = await loadPendingBookings('vizeon')

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
            <BookingCard key={b.id} booking={b} business="vizeon" />
          ))}
        </div>
      )}
    </div>
  )
}
