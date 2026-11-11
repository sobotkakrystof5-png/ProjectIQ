// Staré adresy adminu, které musí fungovat dál (AD02 a AD03, R-088 a R-087).
//
// Odkazy na ně leží v `notifications.link`, ve starých e-mailech klientům
// i v záložkách prohlížeče, takže se nesmí stát 404. Seznam je obyčejný .mjs,
// aby ho mohl načíst `next.config.mjs` i test — jinak by se pravidla psala
// dvakrát a jedna kopie by tichu zestarala.
//
// Pořadí rozhoduje: Next bere první shodu, proto konkrétní adresy před vzorem.

/** @type {{ source: string, destination: string, permanent: boolean }[]} */
export const LEGACY_REDIRECTS = [
  // Dva inboxy se slily do jednoho.
  { source: '/dashboard/vizeon', destination: '/dashboard/poptavky', permanent: true },
  { source: '/alteno/rezervace', destination: '/dashboard/poptavky', permanent: true },
  // Sekce ALTENO zanikla: seznam zakázek, nová zakázka, detail zakázky.
  { source: '/alteno', destination: '/dashboard/zakazky', permanent: true },
  { source: '/alteno/new', destination: '/dashboard/new', permanent: true },
  { source: '/alteno/:path*', destination: '/dashboard/:path*', permanent: true },
  // Hub zanikl (AD03): jeho obrazovky jsou v /dashboard, zbytek vede na Dnes.
  { source: '/hub/finance', destination: '/dashboard/finance', permanent: true },
  { source: '/hub/projekty', destination: '/dashboard/projekty', permanent: true },
  { source: '/hub/projekty/:path*', destination: '/dashboard/projekty/:path*', permanent: true },
  { source: '/hub/byznys/startup', destination: '/dashboard/startup', permanent: true },
  { source: '/hub/byznys/startup/:path*', destination: '/dashboard/startup/:path*', permanent: true },
  // Rozcestník /hub/byznys i sekce smazané v AD01 (/hub/plany, /hub/school,
  // /hub/sport) vedou na Dnes — jejich obsah už nikde není. Ověřeno: i hlubší
  // cesta (`/hub/school/rozvrh/2026`) skončí na `/dashboard` bez zbytků v URL.
  { source: '/hub', destination: '/dashboard', permanent: true },
  { source: '/hub/:path*', destination: '/dashboard', permanent: true },
]

/**
 * Kam povede stará adresa. Jen pro testy a kontroly — v běhu to dělá Next
 * podle stejného seznamu.
 * @param {string} pathname
 * @returns {string | null}
 */
export function resolveLegacyRedirect(pathname) {
  for (const rule of LEGACY_REDIRECTS) {
    const wildcard = rule.source.endsWith('/:path*')
    if (!wildcard) {
      if (pathname === rule.source) return rule.destination
      continue
    }
    const base = rule.source.slice(0, -'/:path*'.length)
    if (pathname === base) return rule.destination.replace('/:path*', '')
    if (pathname.startsWith(`${base}/`)) {
      return rule.destination.replace('/:path*', pathname.slice(base.length))
    }
  }
  return null
}
