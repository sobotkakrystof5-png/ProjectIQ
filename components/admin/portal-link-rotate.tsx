'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { regeneratePortalLink, restorePortalLink } from '@/app/portal-link-actions'

/**
 * Vymění odkaz na portál `/p/[token]`. Bez potvrzovacího dialogu: akce proběhne
 * hned a toast nabídne „Zpět" (AGENTS.md → B9).
 */
export function PortalLinkRotate({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function rotate() {
    start(async () => {
      const res = await regeneratePortalLink(projectId)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      router.refresh()
      toast.success('Odkaz je nový. Starý už nefunguje.', {
        description: 'Pošlete klientovi ten nový.',
        undo: () => {
          void restorePortalLink(projectId, res.previous, res.current).then((back) => {
            if (back.success) {
              toast.message('Vrátili jsme původní odkaz.')
              router.refresh()
            } else toast.error(back.error)
          })
        },
      })
    })
  }

  return (
    <button
      type="button"
      onClick={rotate}
      disabled={pending}
      className="inline-flex min-h-11 items-center gap-2 rounded-chip border border-navy-100 px-4 text-sm font-medium text-ink transition-colors hover:border-navy-300 disabled:opacity-50"
    >
      <RefreshCw size={14} strokeWidth={1.5} aria-hidden />
      Vygenerovat nový odkaz
    </button>
  )
}
