'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOrganizationList } from '@clerk/nextjs'
import { Logo } from '@/components/ws/brand'
import { Button } from '@/components/ui/button'

/**
 * Uživatel už účet má, jen jeho organizace není po přihlášení aktivní
 * (Clerk ji sám nevybere). Aktivuje ji a pošle ho do aplikace.
 */
export function ActivateAccount({ orgId }: { orgId: string }) {
  const router = useRouter()
  const { isLoaded, setActive } = useOrganizationList()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isLoaded) return
    setActive({ organization: orgId })
      .then(() => {
        router.replace('/w')
        router.refresh()
      })
      .catch(() => setFailed(true))
  }, [isLoaded, setActive, orgId, router])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ground px-4 text-center">
      <Logo size={40} animated />
      {failed ? (
        <>
          <p role="alert" className="text-[15px] text-ink">
            Účet se nepodařilo otevřít. Zkuste to prosím znovu.
          </p>
          <Button onClick={() => window.location.reload()}>Zkusit znovu</Button>
        </>
      ) : (
        <p className="text-[15px] text-quiet" aria-live="polite">
          Otevírám váš účet…
        </p>
      )}
    </main>
  )
}
