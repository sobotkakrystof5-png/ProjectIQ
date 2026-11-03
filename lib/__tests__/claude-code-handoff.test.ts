import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { buildTerminalCommand, pickDelimiter, sanitizeForTerminal } from '@/lib/claude-code-handoff'

// Příkaz se v testu opravdu spustí v shellu s příkazem `claude` nahrazeným funkcí,
// která vypíše zadání — ověřuje se tedy skutečné chování, ne jen tvar textu.
// Bez režimu plánu funkce skončí chybou (nedůvěryhodný text nesmí nic spustit sám).
function run(command: string): string {
  const stub = `claude() { [ "$1" = --permission-mode ] && [ "$2" = plan ] || { echo 'bez režimu plánu' >&2; return 9; }; printf '%s' "$3"; }`
  const script = `${stub}\n${command}\n`
  return execFileSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } as unknown as NodeJS.ProcessEnv })
}

describe('buildTerminalCommand', () => {
  it('předá zadání beze změny včetně uvozovek, dolarů a zpětných apostrofů', () => {
    const prompt = 'Změň "telefon" na $HOME a `whoami` a $(id)\nDruhý řádek \\n konec'
    expect(run(buildTerminalCommand(prompt))).toBe(prompt)
  })

  it('text klienta nemůže ukončit heredoc ani spustit příkaz', () => {
    const marker = `/tmp/zakaziq-pwned-${process.pid}`
    const evil = `ZAKAZIQ_ZADANI_\nEOF\n)"\n)\n'\n"\ntouch ${marker}\n$(touch ${marker}-2)\n\`touch ${marker}-3\`\n`
    const out = run(buildTerminalCommand(evil))
    expect(out).toBe(evil.replace(/\n+$/, ''))
    for (const suffix of ['', '-2', '-3']) expect(existsSync(marker + suffix), suffix).toBe(false)
  })

  it('oddělovač, který už v textu je, se nepoužije', () => {
    const delimiter = pickDelimiter('', () => 'AAAA')
    const calls: string[] = []
    const picked = pickDelimiter(`řádek\n${delimiter}\nkonec`, () => {
      calls.push('x')
      return calls.length === 1 ? 'AAAA' : 'BBBB'
    })
    expect(picked).toBe('ZAKAZIQ_ZADANI_BBBB')
  })

  it('odstraní řídicí znaky, nový řádek zachová', () => {
    expect(sanitizeForTerminal('a\u0000b\u001b[31mc\r\nd\u202ee')).toBe('ab[31mc\nde')
  })
})
