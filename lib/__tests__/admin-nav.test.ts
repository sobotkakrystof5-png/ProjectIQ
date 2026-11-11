import { describe, expect, it } from 'vitest'
import {
  ADMIN_MOBILE_TABS,
  activeHref,
  allNavItems,
  formatBadge,
} from '@/lib/admin-nav'
import { filterPages, normalizeQuery, toLikePattern } from '@/lib/admin-search'

// Cesty ze starých horních lišt (dashboard, alteno) a z mobilního menu před KP01.
const OLD_MENU_PATHS = [
  '/hub',
  '/dashboard',
  '/dashboard/pozadavky',
  '/dashboard/vizeon',
  '/dashboard/calendar',
  '/dashboard/calls',
  '/dashboard/dokoncene',
  '/dashboard/hodnoceni',
  '/dashboard/naklady',
  '/dashboard/faktury',
  '/dashboard/sablony',
  '/dashboard/klienti',
  '/dashboard/novinky',
  '/alteno',
  '/alteno/rezervace',
  '/dashboard/notifications',
  '/dashboard/profil',
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

  it('detail zakázky VIZEON i ALTENO a nová zakázka svítí na Zakázkách', () => {
    expect(activeHref('/dashboard/11111111-1111-4111-8111-111111111111')).toBe('/dashboard/zakazky')
    expect(activeHref('/dashboard/11111111-1111-4111-8111-111111111111/sablona')).toBe('/dashboard/zakazky')
    expect(activeHref('/dashboard/zakazky')).toBe('/dashboard/zakazky')
    expect(activeHref('/dashboard/new')).toBe('/dashboard/zakazky')
    expect(activeHref('/alteno/abc')).toBe('/dashboard/zakazky')
    expect(activeHref('/alteno/new')).toBe('/dashboard/zakazky')
  })

  it('Dnes svítí jen na přesné adrese', () => {
    expect(activeHref('/dashboard')).toBe('/dashboard')
    expect(activeHref('/dashboard/faktury')).toBe('/dashboard/faktury')
  })

  it('vyhrává nejspecifičtější shoda (Rezervace ALTENO před Zakázkami)', () => {
    expect(activeHref('/alteno/rezervace')).toBe('/alteno/rezervace')
    expect(activeHref('/hub/finance')).toBe('/hub/finance')
    expect(activeHref('/hub/byznys')).toBe('/hub')
  })

  it('neznámá adresa nesvítí nikde', () => {
    expect(activeHref('/login')).toBeNull()
  })

  it('odznak nad 99 se zkrátí', () => {
    expect(formatBadge(7)).toBe('7')
    expect(formatBadge(100)).toBe('99+')
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
