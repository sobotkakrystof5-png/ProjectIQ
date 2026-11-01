import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Migrace 093 (aktivita zakázky) a 094 (klíče projektů) proti PGlite:
// pustí se dvakrát po sobě a ověří se omezení v databázi.

const MIGRATIONS = path.resolve(__dirname, '../../migrations')
const read = (file: string) => fs.readFileSync(path.join(MIGRATIONS, file), 'utf8')
const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec('CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text)')
  await db.query('INSERT INTO projects (id, client_name) VALUES ($1, $2), ($3, $4)', [PROJECT, 'A', OTHER, 'B'])
  for (let i = 0; i < 2; i++) {
    await db.exec(read('093_project_activity.sql'))
    await db.exec(read('094_project_agent_keys.sql'))
  }
})

afterAll(async () => {
  await db.close()
})

const insertActivity = (over: Partial<Record<string, unknown>> = {}) => {
  const v = { status: 'draft', source: 'manual', kind: 'done', title: 'T', body: 'B', sensitive: false, published: null as string | null, ...over }
  return db.query(
    `INSERT INTO project_activity (project_id, status, source, kind, title, body, contains_sensitive, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [PROJECT, v.status, v.source, v.kind, v.title, v.body, v.sensitive, v.published],
  )
}

describe('093 project_activity', () => {
  it('přijme koncept i zveřejněnou zprávu', async () => {
    await insertActivity()
    await insertActivity({ status: 'published', published: '2026-11-01T10:00:00Z' })
  })

  it('odmítne neplatný stav, zdroj a druh', async () => {
    await expect(insertActivity({ status: 'hotovo' })).rejects.toThrow()
    await expect(insertActivity({ source: 'klient' })).rejects.toThrow()
    await expect(insertActivity({ kind: 'jine' })).rejects.toThrow()
  })

  it('hlídá délky nadpisu a textu', async () => {
    await expect(insertActivity({ title: '' })).rejects.toThrow()
    await expect(insertActivity({ title: 'a'.repeat(161) })).rejects.toThrow()
    await expect(insertActivity({ body: 'b'.repeat(4001) })).rejects.toThrow()
    await insertActivity({ title: 'a'.repeat(160), body: 'b'.repeat(4000) })
  })

  it('zveřejněná zpráva musí mít datum a nesmí být citlivá', async () => {
    await expect(insertActivity({ status: 'published', published: null })).rejects.toThrow()
    await expect(insertActivity({ status: 'published', published: '2026-11-01T10:00:00Z', sensitive: true })).rejects.toThrow()
  })

  it('smazání zakázky smaže i její aktivitu', async () => {
    await db.query('INSERT INTO project_activity (project_id, title, body) VALUES ($1, $2, $3)', [OTHER, 'T', 'B'])
    await db.query('DELETE FROM projects WHERE id = $1', [OTHER])
    const { rows } = await db.query('SELECT count(*)::int AS n FROM project_activity WHERE project_id = $1', [OTHER])
    expect((rows[0] as { n: number }).n).toBe(0)
  })
})

describe('094 project_agent_keys', () => {
  const hash = 'a'.repeat(64)
  const insertKey = (prefix: string, keyHash = hash, revoked: string | null = null) =>
    db.query('INSERT INTO project_agent_keys (project_id, prefix, key_hash, revoked_at) VALUES ($1, $2, $3, $4)', [
      PROJECT,
      prefix,
      keyHash,
      revoked,
    ])

  it('hlídá tvar prefixu a hashe', async () => {
    await expect(insertKey('krátký')).rejects.toThrow()
    await expect(insertKey('Ab12Cd34Ef', 'není-hash')).rejects.toThrow()
  })

  it('povolí jen jeden platný klíč na projekt a prefix je jedinečný', async () => {
    await insertKey('Ab12Cd34Ef')
    await expect(insertKey('Zz99Yy88Xx')).rejects.toThrow()
    await db.query("UPDATE project_agent_keys SET revoked_at = now() WHERE prefix = 'Ab12Cd34Ef'")
    await insertKey('Zz99Yy88Xx')
    await expect(insertKey('Zz99Yy88Xx', hash, '2026-11-01T00:00:00Z')).rejects.toThrow()
  })
})
