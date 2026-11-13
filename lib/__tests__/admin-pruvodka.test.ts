import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { buildJourney, nextStep, JOURNEY_STEPS, type JourneyFacts } from '@/lib/admin/journey'
import type { Project } from '@/lib/types'

/**
 * AD11: průvodka zakázky a pojistka proti dvojímu započtení příjmu.
 *
 * Průvodka nečte nic nového — skládá, co v databázi je. Proto jde otestovat
 * bez databáze; stačí zakázka a čtyři příznaky.
 */

type Zakazka = Parameters<typeof buildJourney>[0]

const prazdne: JourneyFacts = { schuzka: false, faktura: false, fakturaZaplacena: false, hodnoceni: false }

const zakazka = (over: Partial<Project> = {}): Zakazka => ({
  id: '11111111-1111-4111-8111-111111111111',
  source: 'manual',
  status: 'new',
  price: null,
  paid: false,
  deposit_amount: null,
  deposit_paid: false,
  closed_at: null,
  ...over,
}) as Zakazka

const splneno = (steps: ReturnType<typeof buildJourney>, key: string) =>
  steps.find((s) => s.key === key)?.done

describe('průvodka zakázky', () => {
  it('krok Faktura vede od AD12 rovnou na vystavení s předvyplněnou zakázkou', () => {
    const faktura = buildJourney(zakazka({ status: 'done' }), prazdne).find((s) => s.key === 'faktura')
    expect(faktura?.action).toEqual({
      label: 'Vystavit fakturu',
      href: '/dashboard/faktury/nova?zakazka=11111111-1111-4111-8111-111111111111',
    })
  })

  it('má všech devět kroků v pořadí od poptávky k hodnocení', () => {
    const steps = buildJourney(zakazka(), prazdne)
    expect(steps.map((s) => s.key)).toEqual([...JOURNEY_STEPS])
  })

  // Našlo se při průchodu v prohlížeči: kdyby ruční zakázka měla „Poptávku"
  // nesplněnou, osa by na ní uvázla navždy a tlačítko dalšího kroku by se
  // nikdy neukázalo. Odkud zakázka přišla říká štítek v hlavičce.
  it('poptávka je splněná vždy, u ruční zakázky s poznámkou', () => {
    const rucni = buildJourney(zakazka(), prazdne).find((s) => s.key === 'poptavka')
    const zWebu = buildJourney(zakazka({ source: 'vizeon_web' }), prazdne).find((s) => s.key === 'poptavka')
    expect(rucni?.done).toBe(true)
    expect(zWebu?.done).toBe(true)
    expect(rucni?.waiting).toContain('ručně')
    expect(zWebu?.waiting).toBeUndefined()
  })

  it('ruční zakázka hned radí domluvit termín, ne uvíznout na poptávce', () => {
    const steps = buildJourney(zakazka(), prazdne)
    expect(nextStep(steps, 'new')?.key).toBe('hovor')
  })

  it('rozdělaná zakázka bez schůzky radí doplnit cenu, ne schůzku', () => {
    const steps = buildJourney(zakazka({ status: 'in_progress' }), prazdne)
    // Schůzka má nižší práh než dosažený stav — ten vlak jel.
    expect(nextStep(steps, 'in_progress')?.key).toBe('nabidka')
    // Na ose ale zůstane nesplněná, nic se nepředstírá.
    expect(splneno(steps, 'hovor')).toBe(false)
  })

  it('nabídka je splněná až s vyplněnou cenou', () => {
    expect(splneno(buildJourney(zakazka({ price: null }), prazdne), 'nabidka')).toBe(false)
    expect(splneno(buildJourney(zakazka({ price: 0 }), prazdne), 'nabidka')).toBe(false)
    expect(splneno(buildJourney(zakazka({ price: 12000 }), prazdne), 'nabidka')).toBe(true)
  })

  it('zakázka bez zálohy krok zálohy přeskakuje', () => {
    expect(splneno(buildJourney(zakazka(), prazdne), 'zaloha')).toBe(true)
    expect(splneno(buildJourney(zakazka({ deposit_amount: 5000 }), prazdne), 'zaloha')).toBe(false)
    expect(
      splneno(buildJourney(zakazka({ deposit_amount: 5000, deposit_paid: true }), prazdne), 'zaloha'),
    ).toBe(true)
  })

  it('pozdější stav nechá dřívější kroky splněné', () => {
    const steps = buildJourney(zakazka({ status: 'done' }), prazdne)
    expect(splneno(steps, 'prace')).toBe(true)
    expect(splneno(steps, 'predano')).toBe(true)
  })

  it('zaplaceno pozná i zakázku bez faktury', () => {
    expect(splneno(buildJourney(zakazka({ paid: true }), prazdne), 'zaplaceno')).toBe(true)
    expect(
      splneno(buildJourney(zakazka(), { ...prazdne, fakturaZaplacena: true }), 'zaplaceno'),
    ).toBe(true)
  })

  it('další krok je první nesplněný a nabízí jednu akci', () => {
    const steps = buildJourney(zakazka({ source: 'vizeon_web' }), { ...prazdne, schuzka: true })
    const next = nextStep(steps, 'new')
    expect(next?.key).toBe('nabidka')
    expect(next?.action).toEqual({ label: 'Doplnit cenu', href: '#editace-zakazky' })
  })

  it('prvním krokem k práci je změna stavu, ne odkaz', () => {
    const steps = buildJourney(
      zakazka({ source: 'vizeon_web', price: 10000 }),
      { ...prazdne, schuzka: true },
    )
    expect(nextStep(steps, 'new')?.action).toEqual({ label: 'Začít pracovat', status: 'in_progress' })
  })

  it('hodnocení říká, co se s dotazníkem stalo (AD16)', () => {
    const krok = (p: Parameters<typeof zakazka>[0]) =>
      buildJourney(zakazka(p), prazdne).find((s) => s.key === 'hodnoceni')

    expect(krok({})?.waiting).toContain('až zakázku uzavřete')
    expect(krok({ closed_at: '2026-11-01' })?.waiting).toContain('za chvíli odejde')
    expect(krok({ closed_at: '2026-11-01', survey_requested_at: '2026-11-02' })?.waiting).toContain(
      'Čeká se na odpověď',
    )
    // Po připomínce už se neříká, že nějaká přijde — druhá neodejde.
    const popripomince = krok({
      closed_at: '2026-11-01',
      survey_requested_at: '2026-11-02',
      survey_reminded_at: '2026-11-09',
    })?.waiting
    expect(popripomince).toContain('Připomínka')
    expect(popripomince).toContain('další už neposlílám')

    // Na hodnocení se klikat nedá — dotazník odejde sám.
    expect(krok({})?.action).toBeUndefined()
  })

  it('uzavřená zakázka bez hodnocení osu za hotovou nevydává', () => {
    const steps = buildJourney(
      zakazka({ source: 'vizeon_web', price: 10000, paid: true, status: 'paid', closed_at: '2026-11-01' }),
      { schuzka: true, faktura: true, fakturaZaplacena: true, hodnoceni: false },
    )
    expect(nextStep(steps, 'paid')?.key).toBe('hodnoceni')
  })

  it('hotová zakázka nemá další krok', () => {
    const steps = buildJourney(
      zakazka({ source: 'vizeon_web', price: 10000, paid: true, status: 'paid', closed_at: '2026-11-01' }),
      { schuzka: true, faktura: true, fakturaZaplacena: true, hodnoceni: true },
    )
    expect(nextStep(steps, 'paid')).toBeNull()
  })
})

/**
 * „Žádná cesta nevytvoří druhý příjem ke stejné zakázce" (kritérium AD11).
 *
 * Dvojí započtení dělal `createCompletedProject`: vkládal příjem
 * se `source_completed_project_id` nezávisle na tom, jestli zakázka svůj
 * příjem už má. Ta cesta po AD11 neexistuje a tenhle test hlídá, aby se
 * nevrátila — zápis přes `completed_projects` je od teď chyba.
 */
describe('příjem ke stejné zakázce může vzniknout jen jednou', () => {
  const ROOT = path.resolve(__dirname, '../..')
  const DIRS = ['app', 'lib', 'components']

  function souboryKodu(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue
        souboryKodu(full, out)
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full)
      }
    }
    return out
  }

  const soubory = DIRS.flatMap((d) => souboryKodu(path.join(ROOT, d)))

  it('kód adminu nikde nepíše do completed_projects', () => {
    const hrisnici = soubory.filter((f) => {
      const text = fs.readFileSync(f, 'utf8')
      return /INSERT INTO completed_projects|UPDATE completed_projects/.test(text)
    })
    expect(hrisnici.map((f) => path.relative(ROOT, f))).toEqual([])
  })

  it('žádný příjem se neváže na zrušenou tabulku Dokončených', () => {
    const hrisnici = soubory.filter((f) =>
      fs.readFileSync(f, 'utf8').includes('source_completed_project_id'),
    )
    expect(hrisnici.map((f) => path.relative(ROOT, f))).toEqual([])
  })

  it('uzavření zakázky žádný příjem nevytváří', () => {
    const text = fs.readFileSync(path.join(ROOT, 'app/closed-actions.ts'), 'utf8')
    // Jediný INSERT do financí při uzavření je výdaj za převedený odhad nákladů.
    const inserty = text.match(/INSERT INTO finance_transactions[\s\S]*?\n/g) ?? []
    expect(inserty).toHaveLength(1)
    expect(text).toContain("'expense'")
    expect(text).not.toContain("'income'")
  })
})
