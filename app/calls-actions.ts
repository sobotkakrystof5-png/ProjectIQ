'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { LeadStatus } from '@/lib/types'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Neautorizovaný přístup')
}

export type LeadPayload = {
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  lead_status: LeadStatus
  next_action: string | null
  next_action_date: string | null
  notes: string | null
  estimated_value: number | null
}

export async function getLeads() {
  const session = await getServerSession(authOptions)
  if (!session) return []
  return await sql`
    SELECT * FROM client_leads ORDER BY created_at DESC
  `
}

export async function createLead(payload: LeadPayload) {
  await requireAuth()
  await sql`
    INSERT INTO client_leads (
      company_name, contact_name, phone, email,
      lead_status, next_action, next_action_date, notes, estimated_value
    ) VALUES (
      ${payload.company_name},
      ${payload.contact_name},
      ${payload.phone},
      ${payload.email},
      ${payload.lead_status},
      ${payload.next_action},
      ${payload.next_action_date},
      ${payload.notes},
      ${payload.estimated_value}
    )
  `
  revalidatePath('/dashboard/calls')
}

export async function updateLead(id: string, payload: LeadPayload) {
  await requireAuth()
  await sql`
    UPDATE client_leads SET
      company_name = ${payload.company_name},
      contact_name = ${payload.contact_name},
      phone = ${payload.phone},
      email = ${payload.email},
      lead_status = ${payload.lead_status},
      next_action = ${payload.next_action},
      next_action_date = ${payload.next_action_date},
      notes = ${payload.notes},
      estimated_value = ${payload.estimated_value},
      updated_at = now()
    WHERE id = ${id}
  `
  revalidatePath('/dashboard/calls')
}

export async function deleteLead(id: string) {
  await requireAuth()
  await sql`DELETE FROM client_leads WHERE id = ${id}`
  revalidatePath('/dashboard/calls')
}
