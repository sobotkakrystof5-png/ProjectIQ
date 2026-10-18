import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const adminDir = join(process.cwd(), 'lib/ws/admin')
const adminSource = readdirSync(adminDir)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => readFileSync(join(adminDir, file), 'utf8'))
  .join('\n')
const sqlLiterals = [...adminSource.matchAll(/`([\s\S]*?)`/g)].map((match) => match[1])

describe('soukromí v administraci klientů', () => {
  it('nečte poznámky ani volný obsah auditu', () => {
    expect(sqlLiterals.join('\n')).not.toMatch(/\bSELECT\b[^`]*\bnote\b[^`]*\bFROM\s+ws\.account_admin_notes\b/i)
    expect(sqlLiterals.join('\n')).not.toMatch(/\bSELECT\b[^`]*\bdetails\b[^`]*\bFROM\s+ws\.audit_log\b/i)
  })

  it('záznamy zákazníků, poptávek, termínů a peněz používá jen pro souhrny', () => {
    const clientDataQueries = sqlLiterals.filter((sql) =>
      /\bFROM\s+ws\.(?:customers|requests|appointments|invoices|transactions)\b/i.test(sql),
    )
    expect(clientDataQueries.length).toBeGreaterThan(0)
    const sql = clientDataQueries.join('\n')
    expect(sql).not.toMatch(/\bSELECT\s+\*/i)
    const aliases = [...sql.matchAll(/\bFROM\s+ws\.(?:customers|requests|appointments|invoices|transactions)\s+(?:AS\s+)?([a-z_]\w*)/gi)]
      .map((match) => match[1])
    for (const alias of aliases) {
      expect(sql).not.toMatch(new RegExp(`\b${alias}\.(?:name|phone|email|contact|message|field_values|note|details|amount|counterparty|items|description|body|title|address)\b`, 'i'))
    }
  })
})
