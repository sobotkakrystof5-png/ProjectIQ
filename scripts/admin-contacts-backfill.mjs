#!/usr/bin/env node
// Backfill kontaktů (AD09): z textu v pěti tabulkách udělá entitu `contacts`
// a doplní `contact_id`.
//
//   node scripts/admin-contacts-backfill.mjs            jen vypíše, co by udělal
//   node scripts/admin-contacts-backfill.mjs --ano      zapisuje
//   node scripts/admin-contacts-backfill.mjs --ano --tise   bez výpisu po skupinách
//
// Proč to není v migraci: je to masový zápis, který rozhoduje o sporných
// případech. Migrace 104 zakládá jen tabulku a sloupce.
//
// Co skript dělá: přečte řádky **bez** `contact_id`, seskupí je podle
// normalizovaného telefonu, pak e-mailu (lib/contacts/group.ts), kontakt
// založí nebo dohledá a doplní `contact_id`. Co je sporné, **nechá
// nepřiřazené** a vypíše — v adminu se to pak objeví jako kontakt k doplnění
// nebo jako možná duplicita.
//
// Co skript nikdy nedělá: nemaže, nepřepisuje texty v zakázkách a hovorech
// (jsou to snímky dokladů) a nesahá na řádky, které už kontakt mají.
//
// Pozor: DATABASE_URL v .env.local může mířit na produkční Neon. Na produkci
// pouští skript Kryštof, agent na testovací databázi.
//
// Potřebuje Node 22.18+ (spouští lib/contacts/*.ts bez překladu).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { groupContacts } from '../lib/contacts/group.ts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// .env.local se čte ručně — dotenv není v závislostech projektu.
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const args = process.argv.slice(2)
const WRITE = args.includes('--ano')
const QUIET = args.includes('--tise')

loadEnvLocal()
const url = process.env.DATABASE_URL
if (!url) {
  console.error('Chybí DATABASE_URL (.env.local).')
  process.exit(1)
}
const sql = neon(url, { fetchOptions: { cache: 'no-store' } })

/** Odkud se kontakty čtou. `written` je text, který ten řádek nese. */
const SOURCES = [
  {
    table: 'client_leads',
    label: 'Hovory',
    query: `SELECT id::text AS id, contact_name AS name, company_name AS company, email, phone,
                   created_at::text AS seen_at
            FROM client_leads WHERE contact_id IS NULL`,
  },
  {
    table: 'projects',
    label: 'Zakázky',
    query: `SELECT id::text AS id, client_name AS name, NULL AS company, client_email AS email,
                   client_phone AS phone, created_at::text AS seen_at
            FROM projects WHERE contact_id IS NULL`,
  },
  {
    table: 'completed_projects',
    label: 'Dokončené',
    // Dokončená zakázka nemá telefon; dotáhne se ze zdrojové zakázky, aby
    // nevznikl druhý kontakt téhož člověka jen proto, že tu číslo chybí.
    query: `SELECT d.id::text AS id, coalesce(d.client_name, p.client_name) AS name, d.company,
                   coalesce(d.client_email, p.client_email) AS email, p.client_phone AS phone,
                   d.completed_at::text AS seen_at
            FROM completed_projects d
            LEFT JOIN projects p ON p.id = d.source_project_id
            WHERE d.contact_id IS NULL`,
  },
  {
    table: 'consultation_slots',
    label: 'Konzultace',
    // Konzultace je vždy k zakázce — jméno a telefon jsou tam, v rezervaci
    // bývá jen e-mail.
    query: `SELECT s.id::text AS id, p.client_name AS name, NULL AS company,
                   coalesce(s.client_email, p.client_email) AS email, p.client_phone AS phone,
                   s.scheduled_at::text AS seen_at
            FROM consultation_slots s
            LEFT JOIN projects p ON p.id = s.project_id
            WHERE s.contact_id IS NULL`,
  },
  {
    table: 'agent_leads',
    label: 'Poptávky od agenta',
    query: `SELECT id::text AS id, client_name AS name, client_company AS company, client_email AS email,
                   client_phone AS phone, received_at::text AS seen_at
            FROM agent_leads WHERE contact_id IS NULL`,
  },
]

async function readRows() {
  const rows = []
  const perTable = {}
  for (const source of SOURCES) {
    let result
    try {
      result = await sql.query(source.query)
    } catch (e) {
      console.error(`Tabulku ${source.table} nejde přečíst: ${e.message}`)
      console.error('Je migrace 104 aplikovaná? (node scripts/apply-migration.js 104_kontakty.sql)')
      process.exit(1)
    }
    perTable[source.table] = result.length
    for (const row of result) {
      rows.push({
        table: source.table,
        id: row.id,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        seenAt: row.seen_at,
        contactId: null,
      })
    }
  }
  return { rows, perTable }
}

/** Kontakt, který už telefon nebo e-mail má (telefon má přednost). */
async function findExisting(contact) {
  const found = await sql.query(
    `SELECT id FROM (
       SELECT coalesce(merged_into, id)::text AS id, 1 AS poradi
       FROM contacts WHERE $1::text IS NOT NULL AND phone = $1
       UNION ALL
       SELECT coalesce(merged_into, id)::text AS id, 2 AS poradi
       FROM contacts WHERE $2::text IS NOT NULL AND email IS NOT NULL AND lower(email) = lower($2)
     ) x ORDER BY poradi LIMIT 1`,
    [contact.phone, contact.email],
  )
  return found.length > 0 ? found[0].id : null
}

async function createContact(contact) {
  const inserted = await sql.query(
    `INSERT INTO contacts (display_name, company, email, phone, source, last_seen_at)
     VALUES ($1, $2, $3, $4, 'backfill', $5::timestamptz)
     RETURNING id::text AS id`,
    [contact.displayName, contact.company, contact.email, contact.phone, contact.lastSeenAt],
  )
  return inserted[0].id
}

async function linkRows(contactId, rows) {
  const byTable = new Map()
  for (const row of rows) byTable.set(row.table, [...(byTable.get(row.table) ?? []), row.id])
  let linked = 0
  for (const [table, ids] of byTable) {
    // Název tabulky pochází ze SOURCES v tomhle souboru, nikdy od uživatele.
    const updated = await sql.query(
      `UPDATE ${table} SET contact_id = $1 WHERE id = ANY($2::uuid[]) AND contact_id IS NULL RETURNING id`,
      [contactId, ids],
    )
    linked += updated.length
  }
  return linked
}

function head(text) {
  console.log(`\n${text}`)
  console.log('─'.repeat(text.length))
}

async function main() {
  const { rows, perTable } = await readRows()
  const { contacts, conflicts, unassigned } = groupContacts(rows)

  head(WRITE ? 'Backfill kontaktů — zapisuje se' : 'Backfill kontaktů — jen náhled (bez --ano se nic nezapíše)')
  console.log(`Řádků bez kontaktu: ${rows.length}`)
  for (const source of SOURCES) console.log(`  ${source.label.padEnd(20)} ${perTable[source.table] ?? 0}`)
  console.log(`Kontaktů ze seskupení: ${contacts.length}`)
  console.log(`Sporných případů: ${conflicts.length}`)
  console.log(`Řádků, které zůstanou bez kontaktu: ${unassigned.length}`)

  if (conflicts.length > 0) {
    head('Sporné případy (zůstanou k doplnění v adminu)')
    for (const conflict of conflicts) console.log(`• ${conflict.message}`)
  }

  if (!WRITE) {
    if (!QUIET && contacts.length > 0) {
      head('Kontakty, které by vznikly (prvních 20)')
      for (const contact of contacts.slice(0, 20)) {
        const where = [...new Set(contact.rows.map((r) => r.table))].join(', ')
        console.log(`• ${contact.displayName} — ${contact.phone ?? contact.email ?? '—'} (${contact.rows.length}× v ${where})`)
      }
      if (contacts.length > 20) console.log(`… a dalších ${contacts.length - 20}`)
    }
    head('Nic se nezapsalo')
    console.log('Zapíše se to příkazem: node scripts/admin-contacts-backfill.mjs --ano')
    return
  }

  let created = 0
  let reused = 0
  let linked = 0
  for (const contact of contacts) {
    let id = await findExisting(contact)
    if (id === null) {
      try {
        id = await createContact(contact)
        created++
      } catch (e) {
        // Unique index (23505) znamená, že kontakt mezitím vznikl jinde —
        // dohledá se a řádky se napojí na něj.
        if (e.code !== '23505') throw e
        id = await findExisting(contact)
        if (id === null) {
          console.error(`• ${contact.displayName}: kontakt se nepodařilo založit ani dohledat, řádky zůstaly bez kontaktu`)
          continue
        }
        reused++
      }
    } else {
      reused++
    }
    linked += await linkRows(id, contact.rows)
    if (!QUIET) console.log(`• ${contact.displayName.padEnd(28)} ${(contact.phone ?? contact.email ?? '—').padEnd(18)} ${contact.rows.length} řádků`)
  }

  head('Hotovo')
  console.log(`Nových kontaktů: ${created}`)
  console.log(`Použitých existujících: ${reused}`)
  console.log(`Napojených řádků: ${linked}`)
  console.log(`Bez kontaktu zůstalo: ${unassigned.length} (sporné nebo bez údajů — doplní se v adminu)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
