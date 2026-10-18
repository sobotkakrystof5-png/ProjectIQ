'use client'

import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { setGroupSessionOpen } from '@/app/w/[business]/poptavky/actions'
import { useWsAction } from './use-ws-action'

export function SessionRegistrationControl({ slug, sessionId, open }: { slug: string; sessionId: string; open: boolean }) {
  const { run, pending } = useWsAction()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => void run(() => setGroupSessionOpen({ slug, sessionId, open: !open }), (r) => toast.success(r.message))}
    >
      {open ? 'Zastavit přihlašování' : 'Povolit přihlašování'}
    </Button>
  )
}
