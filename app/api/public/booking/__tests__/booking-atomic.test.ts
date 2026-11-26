import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Rezervace z vizeon.cz/alteno.cz: zakázka a termín vzniknou spolu, nebo
 * vůbec (audit 2026-11-24, #7). Dřív při obsazeném termínu zůstala
 * v Poptávkách zakázka bez termínu a další pokus založil druhou.
 * Hlídač překryvů je skutečný z migrací 008 a 044.
 */

let db: PGlite

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    return (await db.query(text, params as unknown[])).rows
  },
}))
vi.mock('@/lib/api-rate-limit', () => ({ isApiRateLimited: async () => false, recordApiRequest: async () => {} }))
vi.mock('@/lib/email', () => ({ sendBrandedEmail: async () => {} }))
vi.mock('@/lib/notifications', () => ({ createNotification: async () => {} }))

import { POST } from '../route'

const KEY = 'vizeon-booking-test-key-0123456789'
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '../../../../../migrations', file), 'utf8')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      client_phone text, service_type text, description text, status text NOT NULL DEFAULT 'new',
      source text, lead_origin text NOT NULL DEFAULT 'vizeon', created_at timestamptz DEFAULT now()
    );
    CREATE TABLE calendar_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text,
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, event_type text NOT NULL DEFAULT 'manual',
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL, lead_origin text NOT NULL DEFAULT 'vizeon',
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE consultation_slots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects(id),
      scheduled_at timestamptz NOT NULL UNIQUE
    );
  `)
  await db.exec(read('008_calendar_overlap_guard.sql'))
  await db.exec(read('044_cross_table_overlap_guard.sql'))
  process.env.VIZEON_API_KEY = KEY
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec('TRUNCATE calendar_events, consultation_slots, projects')
})

const request = (time: string) =>
  new NextRequest('http://localhost/api/public/booking', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({
      clientName: 'Jana Ukázková',
      clientEmail: 'jana@example.cz',
      date: '2027-03-10',
      time,
      projectType: 'Nový web',
      source: 'vizeon_web',
    }),
  })

const count = async (table: string) => Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n)

describe('POST /api/public/booking', () => {
  it('úspěch založí jednu zakázku a jeden termín, který na ni ukazuje', async () => {
    const res = await POST(request('10:00'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(await count('projects')).toBe(1)
    expect(await count('calendar_events')).toBe(1)
    const ev = (await db.query<{ project_id: string }>('SELECT project_id::text FROM calendar_events')).rows[0]
    expect(ev.project_id).toBe(body.bookingId)
    expect(body.eventId).toBeTruthy()
  })

  it('obsazený termín vrátí 409 a nenechá v Poptávkách zakázku bez termínu', async () => {
    expect((await POST(request('10:00'))).status).toBe(200)
    const again = await POST(request('10:30'))
    expect(again.status).toBe(409)
    expect((await again.json()).code).toBe('SLOT_TAKEN')
    expect(await count('projects')).toBe(1)
    expect(await count('calendar_events')).toBe(1)
    // Ani další pokus nic nepřidá.
    expect((await POST(request('10:15'))).status).toBe(409)
    expect(await count('projects')).toBe(1)
  })
})
