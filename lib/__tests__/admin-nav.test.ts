import { describe, expect, it } from 'vitest'
import {
  ADMIN_MOBILE_TABS,
  ADMIN_NAV,
  activeHref,
  allNavItems,
  formatBadge,
} from '@/lib/admin-nav'
import { resolveLegacyRedirect } from '@/lib/legacy-redirects.mjs'
import { filterPages, normalizeQuery, toLikePattern } from '@/lib/admin-search'

// Cesty ze starých horních lišt a z mobilního menu před KP01. Adresy zrušené
// v AD02 (`/dashboard/vizeon`, `/alteno*`) a v AD03 (`/hub*`) tu nejsou — ty
// řeší přesměrování (lib/__tests__/lead-origins.test.ts a test níž).
const OLD_MENU_PATHS = [
  '/dashboard',
  '/dashboard/pozadavky',
  '/dashboard/poptavky',
  '/dashboard/calendar',
  '/dashboard/calls',
  '/dashboard/dokoncene',
  '/dashboard/hodnoceni',
  '/dashboard/naklady',
  '/dashboard/faktury',
  '/dashboard/klienti',
  '/dashboard/novinky',
  '/dashboard/notifications',
  '/dashboard/profil',
  // Obrazovky přesunuté z Hubu (AD03).
  '/dashboard/finance',
  '/dashboard/projekty',
  '/dashboard/startup',
]

describe('navigace administrace', () => {
  const hrefs = allNavItems().map((i) => i.href)

  it('každá dřívější položka menu má v nové navigaci své místo', () => {
    for (const path of OLD_MENU_PATHS) {
      expect(activeHref(path), path).not.toBeNull()
    }
  })

  it('adresy položek jsou jedinečné', () => {
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('spodní lišta na telefonu ukazuje jen existující položky', () => {
    for (const href of ADMIN_MOBILE_TABS) expect(hrefs).toContain(href)
  })

  it('detail zakázky i nová zakázka svítí na Zakázkách', () => {
    expect(activeHref('/dashboard/11111111-1111-4111-8111-111111111111')).toBe('/dashboard/zakazky')
    expect(activeHref('/dashboard/zakazky')).toBe('/dashboard/zakazky')
    expect(activeHref('/dashboard/new')).toBe('/dashboard/zakazky')
  })

  it('Dnes svítí jen na přesné adrese', () => {
    expect(activeHref('/dashboard')).toBe('/dashboard')
    expect(activeHref('/dashboard/faktury')).toBe('/dashboard/faktury')
  })

  it('vyhrává nejspecifičtější shoda', () => {
    expect(activeHref('/dashboard/poptavky')).toBe('/dashboard/poptavky')
    expect(activeHref('/dashboard/finance')).toBe('/dashboard/finance')
    expect(activeHref('/dashboard/startup/11111111-1111-4111-8111-111111111111')).toBe('/dashboard/startup')
  })

  it('menu má jednu podobu: pět skupin a žádný odkaz mimo /dashboard', () => {
    expect(ADMIN_NAV.map((g) => g.label)).toEqual(['Přehled', 'Práce', 'Peníze', 'Klienti', 'Osobní'])
    expect(hrefs.every((href) => href.startsWith('/dashboard'))).toBe(true)
  })

  it('neznámá adresa nesvítí nikde', () => {
    expect(activeHref('/login')).toBeNull()
  })

  it('Kontakty v menu zatím nejsou — obrazovku staví AD09', () => {
    expect(hrefs).not.toContain('/dashboard/kontakty')
  })

  it('odznak nad 99 se zkrátí', () => {
    expect(formatBadge(7)).toBe('7')
    expect(formatBadge(100)).toBe('99+')
  })
})

// Hub zanikl (AD03, R-087). Jeho adresy leží v e-mailech, v `notifications.link`
// a v záložkách, takže musí dál někam vést — ne na 404 ani na 500.
describe('staré adresy Hubu', () => {
  it('obrazovky přesunuté do /dashboard vedou na své nové místo', () => {
    expect(resolveLegacyRedirect('/hub/finance')).toBe('/dashboard/finance')
    expect(resolveLegacyRedirect('/hub/projekty')).toBe('/dashboard/projekty')
    expect(resolveLegacyRedirect('/hub/projekty/new')).toBe('/dashboard/projekty/new')
    expect(resolveLegacyRedirect('/hub/byznys/startup')).toBe('/dashboard/startup')
    expect(resolveLegacyRedirect('/hub/byznys/startup/abc')).toBe('/dashboard/startup/abc')
  })

  it('rozcestníky a sekce smazané v AD01 vedou na Dnes', () => {
    for (const path of ['/hub', '/hub/byznys', '/hub/plany', '/hub/school', '/hub/sport']) {
      expect(resolveLegacyRedirect(path), path).toBe('/dashboard')
    }
  })

  it('každá stará adresa Hubu končí na existující položce menu', () => {
    for (const path of ['/hub', '/hub/finance', '/hub/projekty', '/hub/byznys/startup']) {
      const target = resolveLegacyRedirect(path)
      expect(target, path).not.toBeNull()
      expect(activeHref(target as string), path).not.toBeNull()
    }
  })
})

describe('hledání', () => {
  it('bez diakritiky a bez ohledu na velikost najde stránku', () => {
    const hits = filterPages(allNavItems(), 'POZADAVKY')
    expect(hits.map((h) => h.href)).toContain('/dashboard/pozadavky')
    expect(normalizeQuery('Šablony')).toBe('sablony')
  })

  it('příliš krátký dotaz nejde do databáze a zástupné znaky se escapují', () => {
    expect(toLikePattern('a')).toBeNull()
    expect(toLikePattern('  ')).toBeNull()
    expect(toLikePattern('50%_a')).toBe('%50\\%\\_a%')
    expect(toLikePattern('x'.repeat(200))?.length).toBe(82)
  })
})
