import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ChevronRight, Clock3, FileText, Gift, Globe, ListChecks, Mail, Palette, SlidersHorizontal, Users, Wrench } from 'lucide-react'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { AccentHeading } from '@/components/ws/brand'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { navHref } from '@/lib/ws/nav'
import { pragueToday } from '@/lib/ws/time'

export const metadata: Metadata = { title: 'Nastavení' }

type SearchParams = Record<string, string | string[] | undefined>

const SECTIONS = [
  { path: 'firma', icon: Building2, title: 'Firma a fakturace', text: 'Údaje dodavatele na vašich fakturách' },
  { path: 'funkce', icon: SlidersHorizontal, title: 'Funkce', text: 'Zapněte jen to, co ve své firmě opravdu používáte' },
  { path: 'sluzby', icon: Wrench, title: 'Služby a ceník', text: 'Délka, cena, rozestup a nabídka pro objednání' },
  { path: 'oteviraci-doba', icon: Clock3, title: 'Otevírací doba a pracovníci', text: 'Směny, dostupnost a blokace v kalendáři' },
  { path: 'formular', icon: FileText, title: 'Formulář poptávky', text: 'Kolonky, které zákazník vyplní na webu' },
  { path: 'stavy', icon: ListChecks, title: 'Stavy zakázky', text: 'Vlastní postup práce od nové po hotovou zakázku' },
  { path: 'emaily', icon: Mail, title: 'E-maily a upozornění', text: 'Co chodí zákazníkům a vám, texty e-mailů a náhled' },
  { path: 'web', icon: Globe, title: 'Napojený web', text: 'Odkaz na objednání, QR kód, widget a napojení vašeho webu' },
  { path: 'vernost', icon: Gift, title: 'Věrnost', text: 'Razítka, odměna a pravidla věrnostních karet' },
  { path: 'skupiny', icon: Users, title: 'Skupiny zákazníků', text: 'Kdy je zákazník nový, stálý nebo spící' },
  { path: 'vzhled', icon: Palette, title: 'Vzhled', text: 'Akcentová barva objednávací stránky, portálu a e-mailů' },
] as const
export default async function SettingsPage(
  props: {
    params: Promise<{ business: string }>
    searchParams: Promise<SearchParams>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  const pathname = navHref(business.slug, 'nastaveni')
  const owner = hasRole(ctx, 'owner')

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <AccentHeading>Nastavení</AccentHeading>
      {owner ? (
        <ul className="flex flex-col gap-3">
          {SECTIONS.map(({ path, icon: Icon, title, text }) => (
            <li key={path}>
              <Link
                href={`${pathname}/${path}`}
                className="flex min-h-[72px] items-center gap-4 rounded-panel border border-navy-100 bg-surface px-5 py-4 transition-colors hover:border-navy-300"
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-chip bg-navy-50 text-navy-700">
                  <Icon aria-hidden size={22} strokeWidth={1.5} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[16px] font-semibold text-ink">{title}</span>
                  <span className="text-[14px] text-quiet">{text}</span>
                </span>
                <ChevronRight aria-hidden size={20} strokeWidth={1.5} className="text-quiet" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-quiet">Nastavení firmy mění majitel účtu.</p>
      )}
      <DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={pragueToday()} />
    </div>
  )
}
