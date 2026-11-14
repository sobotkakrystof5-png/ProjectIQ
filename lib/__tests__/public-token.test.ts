import { describe, it, expect } from 'vitest'
import { publicToken } from '@/lib/public-token'

// `projects.public_token` a `projects.survey_token` jsou uuid. Dotaz s čímkoli
// jiným spadne na Postgres 22P02, takže veřejné odkazy /p a /h vracely 500
// místo 404. Tvar se proto ověří, než hodnota dojde do dotazu (audit 2026-11-14).

describe('publicToken', () => {
  it('pustí dál platné UUID a sjednotí ho na malá písmena', () => {
    expect(publicToken('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301')
    expect(publicToken('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301')
  })

  it('odmítne cokoli, co není UUID', () => {
    for (const value of [
      'nesmysl',
      '',
      '   ',
      '3f2504e0-4f89-11d3-9a0c-0305e82c330', // o znak kratší
      '3f2504e0-4f89-11d3-9a0c-0305e82c33011', // o znak delší
      '3f2504e0_4f89_11d3_9a0c_0305e82c3301', // podtržítka
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301' OR '1'='1",
      '../../etc/passwd',
      'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
    ]) {
      expect(publicToken(value), value).toBeNull()
    }
  })

  it('odmítne hodnoty, které nejsou text', () => {
    for (const value of [null, undefined, 42, {}, [], true]) {
      expect(publicToken(value)).toBeNull()
    }
  })
})
