import type { Metadata } from 'next'
import { requireClient } from '@/lib/portal/context'
import { ClientPageHeader, ClientShell } from '@/components/portal/client-shell'

export const metadata: Metadata = { title: 'Vaše údaje' }

// Co se v klientském prostoru děje s údaji klienta (KP10, R-131). Jen fakta,
// která platí v kódu: retence R-076 a migrace 127, přepis hlasu bez uložení
// nahrávky (R-069), zpracovatelé z plánu, oddíl 8.1. Výklad ověřuje Kryštof.

const PROCESSORS: { name: string; what: string }[] = [
  { name: 'Neon', what: 'databáze, servery ve Frankfurtu' },
  { name: 'Supabase', what: 'přihlášení a soubory, které pošlete v chatu, servery ve Frankfurtu' },
  { name: 'Vercel', what: 'provoz webu' },
  { name: 'Resend', what: 'e-maily, které vám z prostoru chodí' },
  { name: 'Google', what: 'Kalendář a Meet pro domluvené konzultace' },
  { name: 'OpenAI', what: 'přepis hlasových zpráv na text, USA' },
  { name: 'Anthropic', what: 'shrnutí vašich požadavků pro mě, USA' },
]

const H2 = 'mb-2 text-base font-semibold text-ink'

export default async function KlientSoukromiPage() {
  const ctx = await requireClient()
  return (
    <ClientShell ctx={ctx} section="prehled">
      <ClientPageHeader title="Vaše údaje" clientName={ctx.clientName} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-6 py-6 text-sm leading-relaxed text-ink">
          <section>
            <h2 className={H2}>Co tu ukládám</h2>
            <p>
              Jméno a e-mail každého, kdo do prostoru chodí. Zprávy v chatu, soubory, které pošlete, domluvené
              konzultace a vaše hodnocení. U zakázek stav, etapy a faktury.
            </p>
            <p className="mt-2">
              Hlasovou zprávu pošlu k přepisu na text a nahrávku hned zahodím. Uložím jen text.
            </p>
          </section>

          <section>
            <h2 className={H2}>Kdo s nimi pracuje</h2>
            <p className="mb-2">Správcem údajů je Kryštof Sobotka, IČO 29977231. Pomáhají mi tyto služby:</p>
            <ul className="space-y-1">
              {PROCESSORS.map((p) => (
                <li key={p.name}>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-quiet">: {p.what}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className={H2}>Jak dlouho</h2>
            <p>
              Zprávy, požadavky a slovní hodnocení smažu tři roky poté, co se na hotové zakázce naposledy něco stalo.
              Faktury musím ze zákona schovat deset let. Použité pozvánky mažu po 90 dnech.
            </p>
          </section>

          <section>
            <h2 className={H2}>Kopie nebo smazání</h2>
            <p>
              Chcete vidět, co o vás mám, nebo to smazat? Napište mi na{' '}
              <a href="mailto:krystof@vizeon.cz" className="font-semibold text-navy-700 hover:underline">
                krystof@vizeon.cz
              </a>
              . Vyřídím to nejpozději do měsíce. Faktury smazat nemůžu, ty zůstanou.
            </p>
          </section>
        </div>
      </div>
    </ClientShell>
  )
}
