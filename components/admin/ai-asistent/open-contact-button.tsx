'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { openOutreachContact } from '@/app/outreach-actions'

/**
 * Firma od asistenta ještě nemá kontakt (R-141): jedním klikem ho dostane
 * a otevře se jeho karta, kde se telefon a e-mail opravují pro všechny.
 */
export function OpenContactButton({ outreachId }: { outreachId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      className="mt-3"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await openOutreachContact(outreachId)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          router.push(`/dashboard/kontakty/${result.contactId}`)
        })
      }
    >
      <UserRound size={16} strokeWidth={1.5} aria-hidden="true" />
      {pending ? 'Ukládám…' : 'Uložit do Kontaktů'}
    </Button>
  )
}
