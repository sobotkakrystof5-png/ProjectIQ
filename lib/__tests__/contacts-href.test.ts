import { describe, expect, it } from 'vitest'
import { formatPhone, mailtoHref, smsHref, telHref, whatsappHref } from '@/lib/contacts/href'
import { MESSAGE_TEMPLATES, templatesFor } from '@/lib/message-templates'

/**
 * Odkazy na zavolání a napsání + šablony zpráv (AD10).
 *
 * Dvě věci, které se musí hlídat testem: do adresy se nesmí dostat nic, co by
 * přepsalo příjemce nebo text (R-062), a šablona nesmí mluvit o údaji, který
 * nemá (B10 — žádná vymyšlená data).
 */

describe('odkazy na telefon', () => {
  it('normalizují zápis čísla', () => {
    expect(telHref('777 123 456')).toBe('tel:+420777123456')
    expect(telHref('00420777123456')).toBe('tel:+420777123456')
    expect(telHref('0777123456')).toBe('tel:+420777123456')
  })

  it('z nesmyslu odkaz neudělají', () => {
    expect(telHref('nevím')).toBeNull()
    expect(telHref('')).toBeNull()
    expect(telHref(null)).toBeNull()
    expect(smsHref('123')).toBeNull()
    expect(whatsappHref(undefined)).toBeNull()
  })

  it('SMS i WhatsApp nesou text zakódovaný', () => {
    expect(smsHref('777123456', 'Dobrý den, platí zítra 9:00?')).toBe(
      'sms:+420777123456?&body=Dobr%C3%BD%20den%2C%20plat%C3%AD%20z%C3%ADtra%209%3A00%3F',
    )
    expect(whatsappHref('+420777123456', 'A & B')).toBe('https://wa.me/420777123456?text=A%20%26%20B')
    // Bez textu jen otevře novou zprávu.
    expect(smsHref('777123456')).toBe('sms:+420777123456')
  })

  it('telefon ukazují po trojicích', () => {
    expect(formatPhone('777123456')).toBe('+420 777 123 456')
    expect(formatPhone('+49 30 123456789')).toBe('+4930123456789')
    expect(formatPhone('x')).toBeNull()
  })
})

describe('mailto', () => {
  it('skládá předmět a text', () => {
    expect(mailtoHref('jana@example.cz', { subject: 'Termín', body: 'Dobrý den,\npotvrzuji.' })).toBe(
      'mailto:jana@example.cz?subject=Term%C3%ADn&body=Dobr%C3%BD%20den%2C%0Apotvrzuji.',
    )
  })

  it('adresu s parametrem odmítne celou', () => {
    // Tohle je ta chyba, kterou R-062 řešil ve Workspace: `?bcc=` v adrese
    // přidá dalšího příjemce, `?body=` přepíše text zprávy.
    expect(mailtoHref('jana@example.cz?bcc=kdokoli@jinde.cz')).toBeNull()
    expect(mailtoHref('jana@example.cz&subject=Vymysleno')).toBeNull()
    expect(mailtoHref('jana@example.cz\nbcc: kdokoli@jinde.cz')).toBeNull()
    // `&` ani `%` v místní části nepustíme, i když je RFC dovoluje.
    expect(mailtoHref('jana&subject=Vymysleno@example.cz')).toBeNull()
    expect(mailtoHref('jana%0abcc:kdokoli@example.cz')).toBeNull()
    expect(mailtoHref('neni adresa')).toBeNull()
    expect(mailtoHref(null)).toBeNull()
  })
})

describe('šablony zpráv', () => {
  it('nabídnou jen to, na co mají údaje', () => {
    const bezTerminu = templatesFor('sms', {})
    expect(bezTerminu.map((t) => t.id)).toEqual(['sms-nedovolal'])

    const sTerminem = templatesFor('sms', { at: '2026-11-14T08:00:00.000Z' })
    expect(sTerminem.map((t) => t.id)).toContain('sms-potvrzeni')
  })

  it('termín píšou pražským časem', () => {
    const potvrzeni = MESSAGE_TEMPLATES.find((t) => t.id === 'sms-potvrzeni')!
    // 8:00 UTC v listopadu = 9:00 v Praze.
    expect(potvrzeni.body({ at: '2026-11-14T08:00:00.000Z' })).toContain('so 14. 11. v 9:00')
  })

  it('bez termínu o termínu nemluví', () => {
    const whatsapp = MESSAGE_TEMPLATES.find((t) => t.id === 'whatsapp-ozveme-se')!
    const text = whatsapp.body({})
    expect(text).not.toMatch(/\d{1,2}:\d{2}/)
    expect(text).toContain('[Sem napište zprávu.]')
  })

  it('e-mailová šablona má předmět a podpis', () => {
    const prehled = MESSAGE_TEMPLATES.find((t) => t.id === 'email-prehled-zakazky')!
    const ctx = { projectName: 'Kavárna Ukázková', portalUrl: 'https://example.cz/p/token' }
    expect(prehled.subject?.(ctx)).toBe('Přehled zakázky Kavárna Ukázková')
    expect(prehled.body(ctx)).toContain('https://example.cz/p/token')
    expect(prehled.body(ctx)).toContain('Kryštof Sobotka')
  })

  it('každá šablona má jen jeden kanál a nekolidující id', () => {
    const ids = MESSAGE_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const template of MESSAGE_TEMPLATES) {
      expect(['sms', 'email', 'whatsapp']).toContain(template.channel)
      // Předmět má smysl jen u e-mailu.
      if (template.channel !== 'email') expect(template.subject).toBeUndefined()
    }
  })
})
