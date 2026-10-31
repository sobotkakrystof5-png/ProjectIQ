import type { Metadata } from 'next'
import { FieldSettings } from '@/components/ws/settings/field-settings'
import { StageSettings } from '@/components/ws/settings/stage-settings'
import { WebIntegration } from '@/components/ws/settings/web-integration'
import { SettingsPageShell } from '@/components/ws/settings/settings-page-shell'
import { appOrigin, orderPageUrl } from '@/lib/ws/app-origin'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { ensureIntegration, isKeyConfigured, maskSecret } from '@/lib/ws/keys'
import { loadIntakeConfig } from '@/lib/ws/intake/intake'
import { buildClaudePrompt } from '@/lib/ws/intake/claude-prompt'
import { getIntakeLog } from '@/lib/ws/intake/log'
import { buildPublicSchema } from '@/lib/ws/intake/schema'
import { getSettingsData } from '@/lib/ws/settings'

function guideMailto(input: { businessName: string; widgetCode: string; orderUrl: string; apiOrigin: string }): string {
  const body = `Dobrý den,\n\nprosím o napojení formuláře na ZakazIQ.\n\nVložte tento kód na web:\n${input.widgetCode}\n\nObjednávková stránka: ${input.orderUrl}\n\nDěkuji\n${input.businessName}`
  return `mailto:?subject=${encodeURIComponent(`Napojení formuláře na ZakazIQ — ${input.businessName}`)}&body=${encodeURIComponent(body)}`
}

export const metadata: Metadata = { title: 'Objednávky · Nastavení' }

export default async function BookingSettingsPage(props: { params: Promise<{ business: string }> }) {
  const { business: slug } = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, slug)
  if (!hasRole(ctx, 'owner')) return <SettingsPageShell businessSlug={slug} title="Objednávky"><p className="text-[15px] text-quiet">Nastavení firmy mění majitel účtu.</p></SettingsPageShell>
  const [data, billing, config, log] = await Promise.all([
    getSettingsData(ctx, business),
    getBillingState(ctx.accountId),
    loadIntakeConfig(ctx.accountId, business.id),
    (async () => {
      const integration = await ensureIntegration(ctx, business)
      return { integration, rows: await getIntakeLog(ctx, business, 20) }
    })(),
  ])
  const apiOrigin = await appOrigin()
  const orderUrl = await orderPageUrl(business.slug)
  const widgetCode = `<script src="${apiOrigin}/embed/${business.slug}.js" async></script>`
  const schema = config ? buildPublicSchema(config, []) : null
  const integration = log.integration
  const jobsOn = data.modules.some((m) => m.module === 'jobs' && m.enabled)

  return <SettingsPageShell businessSlug={business.slug} title="Objednávky">
    <nav aria-label="Části objednávek" className="flex flex-wrap gap-2">
      {[['formular', 'Formulář'], ...(jobsOn ? [['stavy', 'Stavy zakázky']] : []), ['web', 'Napojený web']].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-navy-100 bg-surface px-4 text-sm font-medium text-ink hover:bg-navy-50">{label}</a>)}
    </nav>
    <section id="formular" className="scroll-mt-6 flex flex-col gap-3">
      <div><h2 className="text-[18px] font-semibold text-ink">Formulář poptávky</h2><p className="text-sm text-quiet">Změny se hned projeví v objednávací stránce i na napojeném webu.</p></div>
      <FieldSettings slug={business.slug} fields={data.fields} readOnly={!canWrite(billing)} />
    </section>
    {jobsOn && <section id="stavy" className="scroll-mt-6 flex flex-col gap-3">
      <div><h2 className="text-[18px] font-semibold text-ink">Stavy zakázky</h2><p className="text-sm text-quiet">Typ stavu určuje statistiky a věrnost. Při odstranění vyberete, kam přesunout rozpracované zakázky.</p></div>
      <StageSettings slug={business.slug} stages={data.stages} readOnly={!canWrite(billing)} />
    </section>}
    <section id="web" className="scroll-mt-6 flex flex-col gap-3">
      <div><h2 className="text-[18px] font-semibold text-ink">Napojený web</h2><p className="text-sm text-quiet">Odkaz na objednání, QR kód, widget a příchozí poptávky.</p></div>
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
        log={log.rows.map((row) => ({ id: row.id, at: new Date(row.created_at).toISOString(), channel: row.channel, origin: row.origin, status: Number(row.status), code: row.code, isTest: row.is_test }))}
        readOnly={!canWrite(billing)}
      />
    </section>
  </SettingsPageShell>
}
