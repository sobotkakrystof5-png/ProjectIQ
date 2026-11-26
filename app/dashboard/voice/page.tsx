import type { Metadata } from 'next'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { Card, CardHead } from '@/components/admin/card'
import { VoiceDevicesPanel } from '@/components/admin/voice/devices-panel'
import { listDevices } from '@/lib/admin/voice/devices'
import { isVoiceKeyConfigured } from '@/lib/admin/voice/keys'
import { requireAuth } from '@/lib/auth'

export const metadata: Metadata = { title: 'ZakazIQ Voice' }

/**
 * ZakazIQ Voice (R-148). Zatím jen zařízení (VO01); přehled, historie, učení
 * a slovník přidá VO10. Nehotové části se nenabízejí (R-043).
 */
export default async function VoicePage() {
  await requireAuth()
  const result = await listDevices()

  return (
    <PageShell width="narrow">
      <PageHeader
        title="ZakazIQ Voice"
        subtitle="Diktování na Macu: podržíte fn, mluvíte, pustíte a text se vloží. Tady přidáte Mac a dostanete pro něj klíč."
        subtitleFont="sans"
      />
      <Card>
        <CardHead
          title="Zařízení"
          hint="Každý Mac má vlastní klíč. Klíč umí jen posílat diktáty a číst slovník, nic jiného v administraci."
        />
        {result.ok ? (
          <VoiceDevicesPanel devices={result.devices} configured={isVoiceKeyConfigured()} />
        ) : (
          <p className="text-sm text-quiet">
            Databáze ještě nemá tabulky ZakazIQ Voice. Až proběhne migrace 136, zařízení půjde přidat tady.
          </p>
        )}
      </Card>
    </PageShell>
  )
}
