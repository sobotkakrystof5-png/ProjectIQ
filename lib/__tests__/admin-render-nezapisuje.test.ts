import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * AD08: GET obrazovky adminu nesmí zapisovat.
 *
 * Finance dřív při **každém** vykreslení zakládaly opakované transakce. Dvě
 * věci na tom byly špatně: prefetch odkazu v menu spustil zápis, i když
 * stránku nikdo neotevřel, a naopak — kdo se do Financí měsíc nepodíval,
 * opakované položky za ten měsíc neměl. Dnes to dělá denní cron a tlačítko.
 *
 * Soubory se berou z gitu, takže test nevidí `.claude/worktrees/` ani
 * `new - area of zakaziq/`.
 */

const ROOT = path.resolve(__dirname, '../..')

const tracked = (pattern: string): string[] =>
  execFileSync('git', ['ls-files', pattern], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)

const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8')

const RENDER_FILES = [
  ...tracked('app/dashboard/**/page.tsx'),
  ...tracked('app/dashboard/**/layout.tsx'),
  ...tracked('app/dashboard/**/loading.tsx'),
]

describe('render adminu nezapisuje', () => {
  it('seznam obrazovek není prázdný (jinak test nic netvrdí)', () => {
    expect(RENDER_FILES.length).toBeGreaterThan(20)
  })

  it('žádná obrazovka negeneruje opakované transakce', () => {
    const offenders = RENDER_FILES.filter((f) => /generateRecurring/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('žádná obrazovka nepíše INSERT, UPDATE ani DELETE', () => {
    const offenders = RENDER_FILES.filter((f) => /INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM/i.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('generátory jsou jen v cronu a v server actions Financí', () => {
    const importers = [...tracked('app/**/*.ts'), ...tracked('app/**/*.tsx'), ...tracked('lib/**/*.ts')]
      .filter((f) => /from '@\/lib\/recurring-transactions'/.test(read(f)))
    expect(importers.sort()).toEqual([
      'app/api/cron/send-reminders/route.ts',
      'app/dashboard/finance/finance-actions.ts',
    ])
  })

  it('denní cron doplňuje fixní náklady i cash-flow šablony', () => {
    const cron = read('app/api/cron/send-reminders/route.ts')
    expect(cron).toMatch(/generateRecurringCostTransactionsInternal\(\)/)
    expect(cron).toMatch(/generateRecurringCashFlowTransactionsInternal\(\)/)
  })

  it('ruční doplnění zůstává jako server action s kontrolou přihlášení', () => {
    const actions = read('app/dashboard/finance/finance-actions.ts')
    const fn = actions.slice(actions.indexOf('export async function generateRecurringTransactions'))
    expect(fn).toMatch(/await requireAuth\(\)/)
  })
})
