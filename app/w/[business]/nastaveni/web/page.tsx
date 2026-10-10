import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { WebIntegration } from '@/components/ws/settings/web-integration'
import { appOrigin, orderPageUrl } from '@/lib/ws/app-origin'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { requireBusiness, requireRole, requireWorkspace } from '@/lib/ws/context'
import { ensureIntegration, isKeyConfigured, maskSecret } from '@/lib/ws/keys'
import { loadIntakeConfig } from '@/lib/ws/intake/intake'
import { buildClaudePrompt } from '@/lib/ws/intake/claude-prompt'
import { getIntakeLog } from '@/lib/ws/intake/log'
import { buildPublicSchema } from '@/lib/ws/intake/schema'
import { navHref } from '@/lib/ws/nav'

export const metadata: Metadata = { title: 'Napojený web' }

function guideMailto(input: { businessName: string; widgetCode: string; orderUrl: string; apiOrigin: string }): string {
  const body = `Dobrý den,

prosím o napojení formuláře poptávek na našem webu na ZakazIQ.

Nejjednodušší je vložit tenhle řádek tam, kde má být tlačítko „Objednat se“:
${input.widgetCode}
Pro formulář přímo ve stránce přidejte do značky data-mode="inline".

Widget funguje jen na povolených adresách. Pošlete mi prosím adresu webu (https://…), přidám ji.

Pokud web stavíte sami a máte serverový kód, poptávky jdou posílat i přes API: POST ${input.apiOrigin}/api/public/v1/requests s tajným klíčem v hlavičce Authorization: Bearer. Klíč vám pošlu zvlášť, popis polí vrací GET ${input.apiOrigin}/api/public/v1/schema.

Naše objednávací stránka: ${input.orderUrl}

Děkuji
${input.businessName}`
  return `mailto:?subject=${encodeURIComponent(`Napojení formuláře na ZakazIQ — ${input.businessName}`)}&body=${encodeURIComponent(body)}`
}

/** Nastavení › Napojený web (S11). Jen vlastník. */
export default async function WebIntegrationPage({ params }: { params: { business: string } }) {
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  requireRole(ctx, 'owner')

  const integration = await ensureIntegration(ctx, business)
  const [config, log, billing] = await Promise.all([
    loadIntakeConfig(ctx.accountId, business.id),
    getIntakeLog(ctx, business, 20),
    getBillingState(ctx.accountId),
  ])
  const apiOrigin = appOrigin()
  const orderUrl = orderPageUrl(business.slug)
  const widgetCode = `<script src="${apiOrigin}/embed/${business.slug}.js" async></script>`
  const schema = config ? buildPublicSchema(config, []) : null

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href={navHref(business.slug, 'nastaveni')}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] font-medium text-quiet hover:text-ink"
      >
        <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
        Nastavení
      </Link>
      <AccentHeading accent="sem.">Poptávky z webu rovnou</AccentHeading>
      <WebIntegration
        slug={business.slug}
        businessName={business.name}
        prompt={schema ? buildClaudePrompt({ apiOrigin, schema }) : ''}
        orderUrl={orderUrl}
        widgetCode={widgetCode}
        secretMask={integration.secret_prefix ? maskSecret(integration.secret_prefix) : null}
        keyConfigured={isKeyConfigured()}
        origins={integration.allowed_origins}
        bookingMode={config?.booking ?? 'none'}
        guideMailto={guideMailto({ businessName: business.name, widgetCode, orderUrl, apiOrigin })}
        log={log.map((r) => ({
          id: r.id,
          at: new Date(r.created_at).toISOString(),
          channel: r.channel,
          origin: r.origin,
          status: Number(r.status),
          code: r.code,
          isTest: r.is_test,
        }))}
        readOnly={!canWrite(billing)}
      />
    </div>
  )
}
