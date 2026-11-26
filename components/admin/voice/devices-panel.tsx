'use client'

import { useState, useTransition } from 'react'
import { Copy, Laptop } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { addVoiceDevice, restoreVoiceDevice, revokeVoiceDevice } from '@/app/voice-actions'
import { VOICE_DEVICE_TONE, toneVariant } from '@/lib/admin-status'
import type { VoiceDevice } from '@/lib/admin/voice/devices'

/**
 * Zařízení ZakazIQ Voice (VO01, R-150). Klíč se ukáže jednou hned po přidání
 * a drží ho jen tahle komponenta, dokud se stránka neobnoví.
 */

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  }).format(new Date(iso))

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Klíč zkopírován.')
  } catch {
    toast.error('Kopírování se nepovedlo, označte klíč ručně.')
  }
}

export function VoiceDevicesPanel({ devices, configured }: { devices: VoiceDevice[]; configured: boolean }) {
  const [name, setName] = useState('')
  const [shown, setShown] = useState<{ key: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await addVoiceDevice(name)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setShown({ key: res.key, name: res.device.name })
      setName('')
    })
  }

  const revoke = (device: VoiceDevice) =>
    start(async () => {
      const res = await revokeVoiceDevice(device.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (shown?.name === device.name) setShown(null)
      toast.success(`${device.name} už se nepřipojí.`, {
        description: 'Diktáty z něj zůstávají.',
        undo: () =>
          start(async () => {
            const back = await restoreVoiceDevice(device.id)
            if (!back.ok) toast.error(back.error)
          }),
      })
    })

  const active = devices.filter((d) => !d.revokedAt)
  const revoked = devices.filter((d) => d.revokedAt)

  return (
    <div className="space-y-5">
      {!configured && (
        <p className="rounded-chip bg-signal-bg px-3 py-2 text-sm text-signal-ink">
          Chybí nastavení AGENT_KEY_PEPPER, zařízení zatím nejde přidat.
        </p>
      )}

      {shown && (
        <div className="rounded-chip border border-dashed border-signal-line bg-signal-bg p-4">
          <p className="text-sm font-medium text-signal-ink">Klíč pro {shown.name}</p>
          <p className="mt-1 text-sm text-signal-ink">
            Klíč se už znovu neukáže. Vložte ho do aplikace ZakazIQ Voice.
          </p>
          <code className="mt-3 block break-all rounded-chip bg-surface px-3 py-2 font-mono text-xs text-ink">
            {shown.key}
          </code>
          <Button type="button" variant="outline" className="mt-3" onClick={() => copy(shown.key)}>
            <Copy size={16} strokeWidth={1.5} aria-hidden="true" />
            Zkopírovat
          </Button>
        </div>
      )}

      {active.length === 0 && !shown ? (
        <p className="text-sm text-quiet">
          Zatím žádný Mac. Přidejte ho a klíč vložte do aplikace ZakazIQ Voice v Nastavení › Připojení.
        </p>
      ) : (
        <DeviceList devices={active} onRevoke={revoke} pending={pending} />
      )}

      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-ink">Název zařízení</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="MacBook"
            maxLength={80}
            autoComplete="off"
            className="h-11"
          />
        </label>
        <Button type="submit" disabled={pending || !configured}>
          <Laptop size={16} strokeWidth={1.5} aria-hidden="true" />
          Přidat zařízení
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {revoked.length > 0 && (
        <details className="text-sm">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-quiet">
            Zneplatněná zařízení ({revoked.length})
          </summary>
          <DeviceList devices={revoked} pending={pending} />
        </details>
      )}
    </div>
  )
}

function DeviceList({
  devices,
  onRevoke,
  pending,
}: {
  devices: VoiceDevice[]
  onRevoke?: (d: VoiceDevice) => void
  pending: boolean
}) {
  return (
    <ul className="divide-y divide-navy-100 rounded-chip border border-navy-100">
      {devices.map((d) => (
        <li key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
              <span className="min-w-0 break-words">{d.name}</span>
              <Badge variant={toneVariant(d.revokedAt ? VOICE_DEVICE_TONE.revoked : VOICE_DEVICE_TONE.active)}>
                {d.revokedAt ? 'Zneplatněné' : 'Platné'}
              </Badge>
            </p>
            <p className="text-xs text-quiet">
              <span className="font-mono">{d.keyMask}</span> · přidáno {dateTime(d.createdAt)}
              {' · '}
              {d.revokedAt
                ? `zneplatněno ${dateTime(d.revokedAt)}`
                : d.lastUsedAt
                  ? `naposledy ${dateTime(d.lastUsedAt)}`
                  : 'zatím nepoužité'}
            </p>
          </div>
          {onRevoke && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => onRevoke(d)}>
              Zneplatnit
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
