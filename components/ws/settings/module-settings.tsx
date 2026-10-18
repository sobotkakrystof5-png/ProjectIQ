'use client'

import { Switch } from '@/components/ui/switch'
import { useWsUndoAction } from '@/components/ws/app/booking/use-ws-action'
import { changeModule, restoreModuleSettings } from '@/app/w/[business]/nastaveni/actions'
import type { WsModule } from '@/lib/ws/templates/types'
import type { PortalRules } from '@/lib/ws/portal-rules'
import { PortalRulesForm } from './portal-rules-form'

const MODULE_DETAILS: Record<WsModule, { label: string; text: string; needs?: WsModule }> = {
  requests: { label: 'Poptávky', text: 'Příchozí zprávy a objednávky od zákazníků.' }, customers: { label: 'Zákazníci', text: 'Kontakty, historie návštěv a souhlasy.' }, calendar: { label: 'Kalendář', text: 'Termíny, dostupnost a blokace v jednom místě.' }, jobs: { label: 'Zakázky', text: 'Přehled práce od přijetí po dokončení.' }, loyalty: { label: 'Věrnost', text: 'Razítka a odměny pro vracející se zákazníky.' }, invoices: { label: 'Faktury', text: 'Vystavené faktury a jejich stav.' }, finance: { label: 'Příjmy', text: 'Přijaté platby a přehled peněz.' }, taxes: { label: 'Daně', text: 'Podklady pro daně z příjmů.', needs: 'finance' }, portal: { label: 'Klientský portál', text: 'Zákazník dostane odkaz na svůj termín nebo zakázku. Termín si v něm může přesunout.' }, reviews: { label: 'Hodnocení', text: 'Po dokončení vás zákazník v odkazu ohodnotí od 1 do 10.', needs: 'portal' }, reminders: { label: 'Připomínky', text: 'Připomene zákazníkovi blížící se termín.', needs: 'calendar' },
}

export function ModuleSettings({ slug, modules, readOnly, portalRules }: { slug: string; modules: { module: WsModule; enabled: boolean }[]; readOnly: boolean; portalRules: PortalRules }) {
  const { run, pending } = useWsUndoAction()
  return <ul className="flex flex-col gap-3">
    {modules.map(({ module, enabled }) => {
      const detail = MODULE_DETAILS[module]
      const always = module === 'requests' || module === 'customers'
      return <li key={module} className="flex flex-col gap-4 rounded-panel border bg-surface px-5 py-4"><div className="flex min-h-[44px] items-center justify-between gap-5">
        <div><h2 className="text-[16px] font-semibold text-ink">{detail.label}</h2><p className="mt-0.5 text-sm text-quiet">{detail.text}{detail.needs ? ` Potřebuje zapnuté: ${MODULE_DETAILS[detail.needs].label}.` : ''}</p></div>
        <Switch checked={enabled} disabled={always || readOnly || pending} aria-label={detail.label} onCheckedChange={(next) => void run(
          () => changeModule({ slug, module, enabled: next }),
          () => restoreModuleSettings({ slug, modules }),
          next ? 'Funkce je zapnutá.' : 'Funkce je skrytá. Data zůstala uložená.',
          'Předchozí nastavení je zpátky.',
        )} />
      </div>
      {module === 'portal' && enabled && <PortalRulesForm slug={slug} rules={portalRules} readOnly={readOnly} />}
      </li>
    })}
  </ul>
}
