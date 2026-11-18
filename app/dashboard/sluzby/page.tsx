import type { Metadata } from 'next'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { Card, CardHead } from '@/components/admin/card'
import { ServicesSettings } from '@/components/admin/phases/services-settings'
import { loadServices } from '@/lib/admin/phases'
import { requireAuth } from '@/lib/auth'

export const metadata: Metadata = { title: 'Služby a etapy' }

/**
 * Nastavení › Služby (KP12, R-121). Druhy práce s etapami, typickou délkou
 * a úkoly pro klienta. U nové zakázky se z nich předvyplní etapy s termíny.
 */
export default async function ServicesPage() {
  await requireAuth()
  const services = await loadServices()

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Služby a etapy"
        subtitle="Etapy, které se u nové zakázky předvyplní podle druhu práce. Změny platí pro nové zakázky, běžící zůstávají, jak jsou."
        subtitleFont="sans"
      />
      {services === null ? (
        <Card>
          <CardHead
            title="Ještě není zapnuté"
            hint="Služby a etapy potřebují v databázi migraci 121. Až proběhne, objeví se tady."
          />
        </Card>
      ) : (
        <ServicesSettings services={services} />
      )}
    </PageShell>
  )
}
