import { NextResponse } from 'next/server'
import { appointmentIcs } from '@/lib/ws/email/public-links'

// „Přidat do kalendáře“ z e-mailu zákazníkovi (S15): potvrzený termín jako .ics.

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params
  try {
    const ics = await appointmentIcs(params.token)
    if (!ics) return new NextResponse('Tenhle termín už neplatí.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="termin.ics"',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (e) {
    console.error('ws.email.ics', { error: e instanceof Error ? e.message : 'unknown' })
    return new NextResponse('Termín se nepodařilo načíst. Zkuste to prosím znovu.', { status: 503 })
  }
}
