'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { unsubscribeAction } from '@/app/z/odhlasit/[token]/actions'

export function UnsubscribeForm({ token }: { token: string }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  if (result?.ok) {
    return (
      <p role="status" className="rounded-chip bg-navy-50 px-4 py-3 text-[15px] text-navy-900">
        {result.text}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          type="button"
          size="lg"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await unsubscribeAction({ token })
              setResult(res.ok ? { ok: true, text: res.data.message } : { ok: false, text: res.error })
            })
          }
        >
          Odhlásit se
        </Button>
      </div>
      {result && !result.ok && (
        <p role="alert" className="text-[15px] text-danger">
          {result.text}
        </p>
      )}
    </div>
  )
}
