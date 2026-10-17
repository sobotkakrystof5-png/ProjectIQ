'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { closeAccountAction, reopenAccountAction } from '@/app/w/ucet/actions'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { formatBillingDate } from '@/components/ws/billing/format'

/**
 * Zrušení účtu (S18, R-054): nic dalšího se nezaplatí, data zůstanou 30 dní
 * a pak se smažou. Nejde vrátit po lhůtě, proto potvrzení názvem účtu.
 */
export function CloseAccount({ accountName }: { accountName: string }) {
  const { run, pending } = useWsAction()
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState('')
  const matches = text.trim().toLocaleLowerCase('cs') === accountName.trim().toLocaleLowerCase('cs')

  if (!asking) {
    return (
      <div>
        <Button variant="ghost" className="text-danger hover:bg-danger/10" onClick={() => setAsking(true)}>
          Zrušit účet
        </Button>
      </div>
    )
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!matches) return
    void run(
      () => closeAccountAction({ confirm: text }),
      (r) => toast.success(`Účet je zrušený. Data smažeme ${formatBillingDate(new Date(r.deleteAfter))}.`),
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-box border border-danger/40 bg-ground p-4">
      <p className="text-[15px] text-ink">
        Předplatné hned skončí a nic dalšího nezaplatíte. Objednávací stránka, widget i odkazy pro zákazníky přestanou fungovat.
        Data necháme 30 dní, pak je smažeme. Do té doby jde účet obnovit. Než účet zrušíte, stáhněte si data.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="zrusit-ucet">Pro potvrzení napište název účtu: {accountName}</Label>
        <Input id="zrusit-ucet" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoComplete="off" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={pending || !matches}>
          Zrušit účet
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
          Zavřít
        </Button>
      </div>
    </form>
  )
}

/** Účet ve 30denní lhůtě: tlačítko Obnovit. */
export function ReopenAccount() {
  const { run, pending } = useWsAction()
  return (
    <Button
      disabled={pending}
      onClick={() => void run(reopenAccountAction, () => toast.success('Účet je zpátky. Teď prosím obnovte předplatné.'))}
    >
      Obnovit účet
    </Button>
  )
}
