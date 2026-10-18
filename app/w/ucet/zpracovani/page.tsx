import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AccentHeading, SectionLabel } from '@/components/ws/brand'
import { formatBillingDate } from '@/components/ws/billing/format'
import { requireRole, requireWorkspace } from '@/lib/ws/context'
import { wsDb } from '@/lib/ws/db'

export const metadata: Metadata = { title: 'Záznam o zpracování' }

// Záznam o zpracování osobních údajů (S18, GDPR čl. 30 odst. 2): co ZakazIQ
// jako zpracovatel dělá s údaji zákazníků firmy, kdo je subzpracovatel a
// historie žádostí (export, výmaz, zrušení) z ws.audit_log. Jen majitel.
// Údaje, které nevíme jistě (region databáze, adresa provozovatele), jsou [DOPLNIT].

const ROWS: { label: string; value: string }[] = [
  { label: 'Správce', value: 'Vy jako provozovatel firmy (účet v ZakazIQ).' },
  { label: 'Zpracovatel', value: 'ZakazIQ, provozovatel [DOPLNIT: jméno, IČO, adresa].' },
  { label: 'Účel', value: 'Evidence poptávek, termínů, zakázek, zákazníků, věrnosti a faktur; e-maily zákazníkům jménem firmy.' },
  { label: 'Koho se týká', value: 'Vaši zákazníci a lidé, kteří poslali poptávku; vaši pracovníci s přístupem do účtu.' },
  {
    label: 'Jaké údaje',
    value: 'Jméno, telefon, e-mail, narozeniny (jen když je zadáte), poznámky, odpovědi z formuláře, historie návštěv a zakázek, platby, fakturační údaje, souhlas s nabídkami.',
  },
  { label: 'Jak dlouho', value: 'Po dobu účtu. Po zrušení účtu 30 dní, potom výmaz. Vystavené faktury vymazaného zákazníka 10 let od konce roku vystavení.' },
  { label: 'Zabezpečení', value: 'Šifrované spojení (HTTPS), oddělená data každého účtu v databázi, přihlášení přes ověřený e-mail nebo Google, záznam změn.' },
  { label: 'Přístup k údajům', value: 'Konzole podpory ZakazIQ zobrazuje jen souhrny o účtu, ne záznamy vašich zákazníků. Provozovatel databáze k nim má technicky přístup. Režim soukromí pouze rozmazává jména a částky na tomto zařízení.' },
]

const PROCESSORS: { name: string; role: string; where: string }[] = [
  { name: 'Vercel', role: 'provoz aplikace', where: '[DOPLNIT]' },
  { name: 'Neon', role: 'databáze', where: '[DOPLNIT: region]' },
  { name: 'Clerk', role: 'přihlášení', where: 'USA' },
  { name: 'Stripe', role: 'platby předplatného (jen údaje o vás, ne o zákaznících)', where: '[DOPLNIT]' },
  { name: 'Resend', role: 'odesílání e-mailů', where: '[DOPLNIT]' },
  { name: 'Anthropic', role: 'přepis přijatých faktur z PDF, jen když ho použijete', where: 'USA' },
]

const ACTIONS: Record<string, string> = {
  'customer.erase': 'Smazaný zákazník na jeho žádost',
  'account.export': 'Stažená všechna data účtu',
  'account.close': 'Zrušený účet',
  'account.reopen': 'Obnovený účet',
}

export default async function ZpracovaniPage() {
  const ctx = await requireWorkspace()
  requireRole(ctx, 'owner')
  const events = await wsDb(ctx)<{ action: string; created_at: Date }>`
    SELECT action, created_at FROM ws.audit_log
    WHERE account_id = ${ctx.accountId} AND action IN ('customer.erase', 'account.export', 'account.close', 'account.reopen')
    ORDER BY created_at DESC LIMIT 50`

  return (
    <main className="mx-auto flex min-h-screen max-w-[880px] flex-col gap-8 bg-ground px-4 py-8 text-ink sm:px-8 lg:py-10">
      <Link
        href="/w/ucet"
        className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-full text-sm text-quiet transition-colors duration-200 ease-zq hover:text-ink"
      >
        <ArrowLeft aria-hidden size={18} strokeWidth={1.5} />
        Zpět na účet
      </Link>

      <div className="flex flex-col gap-2">
        <SectionLabel>Účet</SectionLabel>
        <AccentHeading accent="osobních údajů.">Záznam o zpracování</AccentHeading>
      </div>

      <section aria-labelledby="zpracovani-co" className="rounded-panel border border-navy-100 bg-surface p-6">
        <h2 id="zpracovani-co" className="sr-only">
          Co a proč zpracováváme
        </h2>
        <dl className="flex flex-col divide-y divide-navy-100">
          {ROWS.map((r) => (
            <div key={r.label} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="text-sm font-semibold">{r.label}</dt>
              <dd className="text-[15px] text-quiet">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="zpracovani-kdo" className="flex flex-col gap-4">
        <h2 id="zpracovani-kdo" className="text-lg font-semibold tracking-[-0.01em]">
          Kdo nám s tím pomáhá
        </h2>
        <ul className="overflow-hidden rounded-box border border-navy-100 bg-surface">
          {PROCESSORS.map((p) => (
            <li key={p.name} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-navy-100 px-4 py-3 first:border-t-0 sm:px-5">
              <span className="text-sm font-semibold">{p.name}</span>
              <span className="min-w-0 flex-1 text-sm text-quiet">{p.role}</span>
              <span className="text-sm text-quiet">{p.where}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="zpracovani-historie" className="flex flex-col gap-4">
        <h2 id="zpracovani-historie" className="text-lg font-semibold tracking-[-0.01em]">
          Žádosti a výmazy
        </h2>
        {events.length === 0 ? (
          <p className="text-[15px] text-quiet">Zatím žádné. Výmaz zákazníka najdete v jeho kartě, export dat v Účtu.</p>
        ) : (
          <ul className="overflow-hidden rounded-box border border-navy-100 bg-surface">
            {events.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-navy-100 px-4 py-3 first:border-t-0 sm:px-5">
                <span className="font-num text-sm">{formatBillingDate(e.created_at)}</span>
                <span className="text-sm text-quiet">{ACTIONS[e.action] ?? e.action}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
