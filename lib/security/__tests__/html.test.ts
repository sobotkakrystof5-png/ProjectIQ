import { describe, expect, it } from 'vitest'
import { escapeHtml, isSafeHttpUrl, jsonForScript, safeHttpUrl, stripControlChars } from '../html'

describe('escapeHtml', () => {
  it('escapuje všech pět znaků, které mění význam v obsahu i v atributu', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
  })

  it('uvozovka nemůže ukončit hodnotu atributu', () => {
    const html = `<a href="${escapeHtml('https://a.cz/" onmouseover="alert(1)')}">x</a>`
    expect(html).toBe('<a href="https://a.cz/&quot; onmouseover=&quot;alert(1)">x</a>')
    expect(html.match(/"/g)).toHaveLength(2)
  })

  it('už escapovaný text neescapuje dvakrát jinak než očekávaně a nezkomolí diakritiku', () => {
    expect(escapeHtml('Příliš žluťoučký kůň & spol.')).toBe('Příliš žluťoučký kůň &amp; spol.')
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })

  it('null, undefined a čísla jsou bezpečný text', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(42)).toBe('42')
  })
})

describe('safeHttpUrl', () => {
  it('pustí http a https', () => {
    expect(safeHttpUrl('https://vizeon.cz/ukazka')).toBe('https://vizeon.cz/ukazka')
    expect(safeHttpUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x')
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/x',
    '//evil.example/x',
    '/relativni/cesta',
    'https://',
    'https://dobry.cz@zly.cz/',
    'https://uzivatel:heslo@example.com/',
    '',
    '   ',
  ])('odmítne %j', (value) => {
    expect(safeHttpUrl(value)).toBeNull()
    expect(isSafeHttpUrl(value)).toBe(false)
  })

  it('odmítne cokoli, co není řetězec, a příliš dlouhou adresu', () => {
    expect(safeHttpUrl(null)).toBeNull()
    expect(safeHttpUrl(undefined)).toBeNull()
    expect(safeHttpUrl({ toString: () => 'https://a.cz' })).toBeNull()
    expect(safeHttpUrl(`https://a.cz/${'x'.repeat(3000)}`)).toBeNull()
  })

  it('httpsOnly odmítne http, allowCredentials povolí přihlašovací údaje', () => {
    expect(safeHttpUrl('http://a.cz', { httpsOnly: true })).toBeNull()
    expect(safeHttpUrl('https://a.cz', { httpsOnly: true })).toBe('https://a.cz/')
    expect(safeHttpUrl('https://u:p@a.cz/', { allowCredentials: true })).toBe('https://u:p@a.cz/')
  })

  it('isSafeHttpUrl nemění vstup, safeHttpUrl ho normalizuje', () => {
    expect(isSafeHttpUrl('https://financnisprava.gov.cz')).toBe(true)
    expect(safeHttpUrl('https://financnisprava.gov.cz')).toBe('https://financnisprava.gov.cz/')
  })
})

describe('jsonForScript', () => {
  it('</script> v hodnotě nemůže ukončit značku', () => {
    const out = jsonForScript({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('</script')
    expect(out).not.toContain('<')
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' })
  })

  it('escapuje > a & i oddělovače řádků U+2028 a U+2029', () => {
    const out = jsonForScript({ a: 'x > y & z', b: 'a\u2028b\u2029c' })
    expect(out).not.toMatch(/[>&\u2028\u2029]/)
    expect(JSON.parse(out)).toEqual({ a: 'x > y & z', b: 'a\u2028b\u2029c' })
  })
})

describe('stripControlChars', () => {
  it('odstraní CR/LF a další řídicí znaky, takže nejde vložit hlavičku', () => {
    expect(stripControlChars('Předmět\r\nBcc: oběť@example.cz')).toBe('Předmět Bcc: oběť@example.cz')
    expect(stripControlChars('a\u0000b\u007fc\u2028d')).toBe('a b c d')
  })
})
