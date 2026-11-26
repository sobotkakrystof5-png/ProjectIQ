import { describe, expect, it } from 'vitest'
import {
  ALONE_MAX_SPEECH_MS,
  applyBlocklist,
  collapseRepeats,
  echoesPrompt,
  filterSegments,
  isImplausiblyFast,
  type BlockPhrase,
} from '@/lib/admin/voice/guards'
import { STT_PROMPT_MAX_CHARS, applyDictionary, buildSttPrompt, matchSnippet } from '@/lib/admin/voice/dictionary'
import { categoryFor } from '@/lib/admin/voice/categories'
import { countWords, fold, foldText, tidy, words } from '@/lib/admin/voice/text'
import { sttCostUsd } from '@/lib/admin/voice/costs'

// ZakazIQ Voice (R-148, VO02): čisté funkce cesty diktátu.

const BUILTIN: BlockPhrase[] = [
  { text: 'Titulky vytvořil', mode: 'always' },
  { text: 'Děkuji za pozornost', mode: 'alone' },
  { text: 'Konec', mode: 'alone' },
]

describe('text', () => {
  it('počítá slova včetně diakritiky, čísel a slov se spojovníkem', () => {
    expect(words('Ahoj, Petře! Je 14:30 a e-mail přišel.')).toEqual(['Ahoj', 'Petře', 'Je', '14', '30', 'a', 'e-mail', 'přišel'])
    expect(countWords('')).toBe(0)
    expect(countWords(null)).toBe(0)
  })

  it('porovnání bez diakritiky a velikosti písmen', () => {
    expect(fold('Šťastný')).toBe('stastny')
    expect(foldText('Děkuji za pozornost!')).toBe('dekuji za pozornost')
  })

  it('tidy srovná mezery a velké písmeno', () => {
    expect(tidy('  ahoj ,  jak se máš ?')).toBe('Ahoj, jak se máš?')
    expect(tidy('')).toBe('')
  })
})

describe('pojistky', () => {
  it('G2 zahodí tichý segment a smyčku, zbytek nechá', () => {
    const r = filterSegments([
      { text: ' Dobrý den.', noSpeechProb: 0.01, avgLogprob: -0.2, compressionRatio: 1.1 },
      { text: ' Titulky vytvořil JohnyX', noSpeechProb: 0.9, avgLogprob: -1.4, compressionRatio: 1 },
      { text: ' a a a a a a a', noSpeechProb: 0.1, avgLogprob: -0.3, compressionRatio: 3.2 },
      // Vysoká pravděpodobnost ticha, ale jistý přepis: zůstává.
      { text: ' Ano.', noSpeechProb: 0.7, avgLogprob: -0.3, compressionRatio: 1 },
    ])
    expect(r).toEqual({ text: 'Dobrý den. Ano.', dropped: 2 })
  })

  it('G3 sloučí trojí opakování, dvojí nechá a čísla nerozbije', () => {
    expect(collapseRepeats('děkuji děkuji děkuji děkuji').text).toBe('děkuji')
    expect(collapseRepeats('a pak a pak a pak jsem šel').text).toBe('a pak jsem šel')
    expect(collapseRepeats('ano ano, dobře')).toEqual({ text: 'ano ano, dobře', collapsed: false })
    expect(collapseRepeats('stojí 1000 korun').text).toBe('stojí 1000 korun')
    expect(collapseRepeats('10 10 10 kusů').text).toBe('10 kusů')
  })

  it('G4 always vezme frázi i se zbytkem věty, alone jen u krátké nahrávky', () => {
    expect(applyBlocklist('Titulky vytvořil JohnyX. Dobrý den.', BUILTIN, 6000)).toEqual({
      text: 'Dobrý den.',
      hits: ['Titulky vytvořil'],
    })
    expect(applyBlocklist('Děkuji za pozornost.', BUILTIN, ALONE_MAX_SPEECH_MS - 1).text).toBe('')
    // Delší diktát, který končí poděkováním, je skutečný.
    expect(applyBlocklist('Děkuji za pozornost.', BUILTIN, ALONE_MAX_SPEECH_MS + 1).text).toBe('Děkuji za pozornost.')
    expect(applyBlocklist('Posílám nabídku, děkuji za pozornost.', BUILTIN, 1000).hits).toEqual([])
    // „Konec" uvnitř věty není halucinace.
    expect(applyBlocklist('Konec měsíce je v pátek', BUILTIN, 1000).hits).toEqual([])
  })

  it('G5 zastaví víc slov, než se dá vyslovit, krátké výsledky ne', () => {
    expect(isImplausiblyFast(30, 2000)).toBe(true)
    expect(isImplausiblyFast(14, 2000)).toBe(false)
    expect(isImplausiblyFast(6, 100)).toBe(false)
    expect(isImplausiblyFast(10, 0)).toBe(true)
  })

  it('G12 pozná ozvěnu nápovědy, skutečnou větu se jmény ne', () => {
    const prompt = buildSttPrompt([
      { id: '1', term: 'ZakazIQ', heardAs: [] },
      { id: '2', term: 'Prvotka', heardAs: [] },
      { id: '3', term: 'VIZEON', heardAs: [] },
      { id: '4', term: 'SmartCalendar', heardAs: [] },
    ])
    // Tohle vrátilo OpenAI ve VO00 na 5 s ticha.
    expect(echoesPrompt('ZakazIQ, Prvotka, VIZEON, SmartCalendar', prompt)).toBe(true)
    expect(echoesPrompt('Diktát v češtině. Výrazy: ZakazIQ.', prompt)).toBe(true)
    expect(echoesPrompt('V ZakazIQ jsem založil zakázku pro Prvotku a VIZEON pošle fakturu.', prompt)).toBe(false)
    expect(echoesPrompt('V ZakazIQ Prvotka', prompt)).toBe(false)
    expect(echoesPrompt('Prvotka ZakazIQ VIZEON', prompt)).toBe(false) // jiné pořadí
    expect(echoesPrompt('ZakazIQ', prompt)).toBe(false)
    expect(echoesPrompt('cokoli', '')).toBe(false)
  })
})

describe('slovník', () => {
  const terms = [
    { id: 't1', term: 'ZakazIQ', heardAs: ['zákaz IQ', 'zakáz ajkjů'] },
    { id: 't2', term: 'Prvotka', heardAs: ['prvotko'] },
    { id: 't3', term: 'Novák', heardAs: [] },
  ]

  it('nahradí slyšené varianty po celých slovech bez ohledu na velikost a diakritiku', () => {
    const r = applyDictionary('V zakaz iq a ZÁKAZ IQ jsem psal prvotko. Zákazník zůstal.', terms)
    expect(r.text).toBe('V ZakazIQ a ZakazIQ jsem psal Prvotka. Zákazník zůstal.')
    expect(r.fixes).toBe(3)
    expect(r.usedIds.sort()).toEqual(['t1', 't2'])
  })

  it('srovná velká písmena u výrazu, který je má', () => {
    expect(applyDictionary('posílám to do zakaziq', terms).text).toBe('posílám to do ZakazIQ')
    expect(applyDictionary('pan novák', terms)).toMatchObject({ text: 'pan Novák', fixes: 1 })
    expect(applyDictionary('Novák', terms).fixes).toBe(0)
  })

  it('nápověda začíná úvodem, je pod stropem a prázdný slovník nedá nic', () => {
    expect(buildSttPrompt([])).toBe('')
    const long = Array.from({ length: 200 }, (_, i) => ({ id: String(i), term: `Výraz${i}`, heardAs: [] }))
    const prompt = buildSttPrompt(long)
    expect(prompt.startsWith('Diktát v češtině. Výrazy: Výraz0')).toBe(true)
    expect(prompt.length).toBeLessThanOrEqual(STT_PROMPT_MAX_CHARS)
  })

  it('zkratka platí jen pro celý diktát', () => {
    const snippets = [{ id: 's1', trigger: 'můj podpis', expansion: 'S pozdravem\nKryštof Sobotka' }]
    expect(matchSnippet('Můj podpis.', snippets)?.id).toBe('s1')
    expect(matchSnippet('Pošli můj podpis', snippets)).toBeNull()
  })
})

describe('kategorie', () => {
  it('podle aplikace a u prohlížeče podle titulku', () => {
    expect(categoryFor('com.apple.mail')).toBe('email')
    expect(categoryFor('com.tinyspeck.slackmacgap')).toBe('work_msg')
    expect(categoryFor('net.whatsapp.WhatsApp')).toBe('personal_msg')
    expect(categoryFor('com.anthropic.claudefordesktop')).toBe('ai_prompt')
    expect(categoryFor('com.google.Chrome', 'Doručená pošta – Gmail')).toBe('email')
    expect(categoryFor('com.google.Chrome', 'Claude')).toBe('ai_prompt')
    expect(categoryFor('com.google.Chrome', null)).toBe('other')
    expect(categoryFor(null)).toBe('other')
  })
})

describe('cena přepisu', () => {
  it('Groq účtuje nejméně 10 s, neznámý model nic', () => {
    expect(sttCostUsd('groq', 'whisper-large-v3-turbo', 3)).toBeCloseTo((10 / 3600) * 0.04, 12)
    expect(sttCostUsd('groq', 'whisper-large-v3-turbo', 360)).toBeCloseTo(0.004, 12)
    expect(sttCostUsd('openai', 'gpt-4o-transcribe', 60)).toBeCloseTo(0.006, 12)
    expect(sttCostUsd('openai', 'neznamy-model', 60)).toBe(0)
  })
})
