'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHead } from '@/components/admin/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { saveGoogleReviewSetting } from '@/app/closed-actions'

/**
 * Odkaz na recenzi na Googlu (R-119). Spokojeným klientům (9–10) ho dotazník
 * nabídne po odeslání a zkopíruje jim jejich text, ať ho jen vloží.
 */
export function GoogleReviewCard({ url }: { url: string | null }) {
  const router = useRouter()
  const [value, setValue] = useState(url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await saveGoogleReviewSetting(value)
      if (!res.success) {
        setError(res.error)
        return
      }
      toast.success(res.url ? 'Odkaz na recenzi je uložený.' : 'Odkaz na recenzi je smazaný.')
      router.refresh()
    })
  }

  return (
    <Card id="recenze">
      <CardHead
        title="Recenze na Googlu"
        hint="Spokojeným klientům (9–10) dotazník po odeslání nabídne recenzi na Googlu. Odkaz zkopírujete ve svém profilu firmy na Googlu pod Požádat o recenze."
      />
      <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="google-review-url">Odkaz na recenzi</Label>
          <Input
            id="google-review-url"
            type="url"
            inputMode="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://g.page/r/…/review"
            maxLength={500}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'google-review-error' : undefined}
            className="mt-1.5 min-h-11"
          />
        </div>
        <Button type="submit" disabled={pending || value.trim() === (url ?? '')} className="min-h-11">
          Uložit
        </Button>
      </form>
      {error && (
        <p id="google-review-error" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {!url && !error && (
        <p className="mt-2 text-xs text-quiet">Bez odkazu dotazník recenzi na Googlu nenabízí.</p>
      )}
    </Card>
  )
}
