import { describe, expect, it } from 'vitest'
import { diffFeedback, looksLikeTerm, similarity } from '@/lib/admin/voice/learn'

// ZakazIQ Voice (R-148, VO08): rozdíl po slovech a co z opravy vypadá jako pojem.
// Rozbor odpovědi AI je v voice-learner.test.ts (modul je jen pro server).

describe('rozdíl po vložení', () => {
  it('najde dvojici „slyšel → opravil"', () => {
    const d = diffFeedback('Pošli to na prvodka cz zítra.', 'Pošli to na Prvotka cz zítra.')
    expect(d.kind).toBe('pairs')
    expect(d.pairs).toEqual([{ heard: 'prvodka', fixed: 'Prvotka' }])
  })

  it('víc oprav v jednom textu, každá zvlášť', () => {
    const d = diffFeedback('Ahoj vizion, posílám zakaziq přehled.', 'Ahoj Vizeon, posílám ZakazIQ přehled.')
    expect(d.pairs).toEqual([
      { heard: 'vizion', fixed: 'Vizeon' },
      { heard: 'zakaziq', fixed: 'ZakazIQ' },
    ])
    expect(d.userEdits).toBe(2)
  })

  it('jen interpunkce se nepočítá', () => {
    expect(diffFeedback('Ahoj jak se máš', 'Ahoj, jak se máš?')).toEqual({ kind: 'same', pairs: [], userEdits: 0 })
  })

  it('velké písmeno uprostřed věty se počítá, na začátku věty ne', () => {
    expect(diffFeedback('Mám schůzku s novákem.', 'Mám schůzku s Novákem.').pairs).toEqual([{ heard: 'novákem', fixed: 'Novákem' }])
    expect(diffFeedback('dobrý den. díky', 'Dobrý den. Díky').pairs).toEqual([])
  })

  it('přepsaná víc než polovina slov = nový text, neučí se', () => {
    const d = diffFeedback('Zítra ráno zavolám klientovi', 'Pošlu e-mail dnes večer')
    expect(d.kind).toBe('rewrite')
    expect(d.pairs).toEqual([])
  })

  it('celý text smazaný', () => {
    expect(diffFeedback('Titulky vytvořil', '')).toMatchObject({ kind: 'deleted', userEdits: 2 })
    expect(diffFeedback('Titulky vytvořil', ' . ')).toMatchObject({ kind: 'deleted' })
  })

  it('samotné přidání nebo smazání slova není oprava přepisu', () => {
    const d = diffFeedback('Pošli mi to dnes', 'Pošli mi to prosím dnes')
    expect(d).toMatchObject({ kind: 'pairs', pairs: [], userEdits: 1 })
  })

  it('náhrada delší než 3 slova se neučí', () => {
    const d = diffFeedback('jedna dva tři čtyři pět šest sedm osm devět deset', 'jedna X Y Z W pět šest sedm osm devět deset')
    expect(d.pairs).toEqual([])
  })
})

describe('co je pojem', () => {
  it('jméno, číslice uvnitř nebo podobně znějící slovo ano; styl ne', () => {
    expect(looksLikeTerm('vizion', 'Vizeon')).toBe(true)
    expect(looksLikeTerm('zakaziq', 'ZakazIQ')).toBe(true)
    expect(looksLikeTerm('ce tři', 'C3')).toBe(true)
    expect(looksLikeTerm('prvodka', 'prvotka')).toBe(true)
    expect(looksLikeTerm('rychle', 'brzy')).toBe(false)
    expect(looksLikeTerm('nevim', 'nevím')).toBe(false) // jen diakritika = pravopis
  })

  it('podobnost bez diakritiky a velikosti písmen', () => {
    expect(similarity('Vizeon', 'vizeon')).toBe(1)
    expect(similarity('vizion', 'vizeon')).toBeCloseTo(5 / 6)
    expect(similarity('rychle', 'brzy')).toBeLessThan(0.6)
  })
})
