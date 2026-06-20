'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { ClientLead, LeadStatus } from '@/lib/types'

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

export async function convertLeadToProject(leadId: string) {
  await requireAuth()
  const rows = await sql`SELECT * FROM client_leads WHERE id = ${leadId}`
  const lead = rows[0] as unknown as ClientLead
  if (!lead) throw new Error('Kontakt nenalezen')

  await sql`
    INSERT INTO projects (client_name, client_email, client_phone, description, status, progress, price, paid)
    VALUES (
      ${lead.contact_name || lead.company_name},
      ${lead.email},
      ${lead.phone},
      ${lead.notes},
      'new',
      0,
      ${lead.estimated_value},
      false
    )
  `

  await sql`
    UPDATE client_leads SET lead_status = 'converted', updated_at = now() WHERE id = ${leadId}
  `

  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard')
  redirect('/dashboard')
}
