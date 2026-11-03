import Link from 'next/link'
import { AccentHeading, Logo } from '@/components/ws/brand'
import { COMPANY_ID, CTA_LABEL, ROUTES, SUPPORT_LABEL, SUPPORT_MAILTO } from './content'

const linkClass = 'inline-flex min-h-[44px] items-center text-[17px] text-navy-200 transition-colors hover:text-white'

/** Footer s výzvou, odkazy a nenápadným odkazem Admin na /login (brief § 4.10). */
export function Footer() {
  return (
    <footer className="mt-[72px] rounded-t-hero bg-navy-950 text-white md:mt-[120px]">
      <div className="mx-auto max-w-[1200px] px-5 pb-8 pt-14 sm:px-7 md:pt-20">
        <div className="flex flex-col gap-8 border-b border-navy-800 pb-12 lg:flex-row lg:items-end lg:justify-between">
          <AccentHeading as="h2" size="section" onDark className="max-w-[640px]">
            První poptávku můžete přijmout ještě dnes.
          </AccentHeading>
          <a
            href={ROUTES.signUp}
            className="inline-flex min-h-[54px] items-center justify-center self-start rounded-full bg-white px-7 text-lg font-semibold text-navy-950 transition-colors duration-200 ease-zq hover:bg-navy-50 sm:text-[19px] lg:self-auto"
          >
            {CTA_LABEL}
          </a>
        </div>

        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Logo size={34} wordmark onDark />
            <p className="mt-4 max-w-[30ch] text-[17px] leading-relaxed text-navy-300">
              Poptávky, kalendář, zákazníci a peníze malé firmy na jednom místě.
            </p>
          </div>
          <nav aria-label="Produkt">
            <p className="font-num text-sm uppercase tracking-[0.12em] text-navy-400">Produkt</p>
            <ul className="mt-3">
              <li><a href="/#funkce" className={linkClass}>Funkce</a></li>
              <li><a href="/#cenik" className={linkClass}>Ceník</a></li>
              <li><a href="/#dotazy" className={linkClass}>Dotazy</a></li>
            </ul>
          </nav>
          <nav aria-label="Právní">
            <p className="font-num text-sm uppercase tracking-[0.12em] text-navy-400">Právní</p>
            <ul className="mt-3">
              <li><Link href={ROUTES.terms} className={linkClass}>Podmínky</Link></li>
              <li><Link href={ROUTES.privacy} className={linkClass}>Ochrana údajů</Link></li>
              <li><Link href={ROUTES.dpa} className={linkClass}>Zpracovatelská smlouva</Link></li>
            </ul>
          </nav>
          <div>
            <p className="font-num text-sm uppercase tracking-[0.12em] text-navy-400">Podpora</p>
            <ul className="mt-3">
              <li><a href="/#kontakt" className={linkClass}>Kontaktní formulář</a></li>
              <li><a href={SUPPORT_MAILTO} className="inline-flex min-h-[44px] items-center break-all font-num text-[15px] text-navy-300 hover:text-white">{SUPPORT_LABEL}</a></li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-navy-800 pt-6 font-num text-sm text-navy-400">
          <span>© 2026 ZakazIQ · IČO {COMPANY_ID}</span>
          <a href={ROUTES.admin} className="inline-flex min-h-[44px] items-center text-navy-400 transition-colors hover:text-navy-200">
            Admin
          </a>
        </div>
      </div>
    </footer>
  )
}
