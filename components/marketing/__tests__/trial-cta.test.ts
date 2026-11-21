import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CTA, ROUTES, SIGNUP_OPEN, TRY_ANCHOR, trialCta } from '../content'

// Hlavní akce landing page (R-134, D-KV2): dokud Workspace neběží na Supabase,
// nesmí nikoho poslat do registrace, která nejde dokončit naostro.

const dir = join(__dirname, '..')
const read = (f: string) => readFileSync(join(dir, f), 'utf8')

describe('hlavní akce landing page', () => {
  it('registrace je zatím zavřená a tlačítka vedou na formulář', () => {
    expect(SIGNUP_OPEN).toBe(false)
    expect(CTA.href).toBe(`/#${TRY_ANCHOR}`)
    expect(CTA.label).toBe('Chci to vyzkoušet')
    expect(CTA.signInHref).toBe(ROUTES.clientSignIn)
  })

  it('po otevření vrátí registraci a přihlášení do Workspace', () => {
    const open = trialCta(true)
    expect(open.href).toBe(ROUTES.signUp)
    expect(open.label).toBe('Vyzkoušet 14 dní zdarma')
    expect(open.signInHref).toBe(ROUTES.signIn)
  })

  it('žádná komponenta nevede do registrace mimo přepínač', () => {
    for (const f of ['header.tsx', 'hero.tsx', 'modules.tsx', 'pricing.tsx', 'footer.tsx', 'contact-section.tsx']) {
      const src = read(f)
      expect(src, f).not.toContain('ROUTES.signUp')
      expect(src, f).not.toContain('ROUTES.signIn')
      expect(src, f).not.toContain('/w/registrace')
    }
  })

  it('kotva formuláře existuje, když je registrace zavřená', () => {
    expect(read('contact-section.tsx')).toContain('id={TRY_ANCHOR}')
    expect(read('contact-form.tsx')).toContain('TRY_MESSAGE')
  })
})
