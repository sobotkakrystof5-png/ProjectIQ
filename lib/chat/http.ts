import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { CHAT_MAX_BODY, CHAT_MAX_TOTAL_BYTES } from '@/lib/chat/types'

/** Odesílá se jen z naší stránky (cookie session, #027). */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(req.url).origin
  } catch {
    return false
  }
}

export function chatFail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

/** Strop těla požadavku: soubory dohromady a text (Vercel víc než ~4,5 MB nepřijme). */
export const CHAT_MAX_REQUEST_BYTES = CHAT_MAX_TOTAL_BYTES + 256 * 1024

const optionalUuid = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional())

export const chatFieldsSchema = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(['text', 'voice', 'approval']),
  body: z.string().max(CHAT_MAX_BODY, `Zpráva může mít nejvýše ${CHAT_MAX_BODY} znaků.`).transform((s) => s.trim()),
  replyTo: optionalUuid,
  approvalUrl: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().url('Odkaz musí být celá adresa.').startsWith('https://', 'Odkaz musí začínat https://.').max(500).optional(),
  ),
})

export type ChatFields = z.infer<typeof chatFieldsSchema>

/** Pole formuláře (bez souborů). `null` = tělo nejde přečíst. */
export async function readChatForm(req: NextRequest): Promise<{ fields: unknown; files: FormDataEntryValue[] } | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > CHAT_MAX_REQUEST_BYTES) return null
  try {
    const form = await req.formData()
    const text = (name: string) => {
      const v = form.get(name)
      return typeof v === 'string' ? v : ''
    }
    return {
      fields: {
        projectId: text('projectId'),
        kind: text('kind') || 'text',
        body: text('body'),
        replyTo: text('replyTo'),
        approvalUrl: text('approvalUrl'),
      },
      files: form.getAll('soubor'),
    }
  } catch {
    return null
  }
}

/** Kód chyby z databázové funkce zprávy → česká hláška. */
export function chatDbError(err: unknown): { status: number; error: string } {
  switch ((err as { code?: string })?.code) {
    case 'P0429':
      return { status: 429, error: 'Posíláte hodně zpráv nebo souborů za sebou. Zkuste to prosím za chvíli.' }
    case 'P0002':
      return { status: 404, error: 'Tahle zakázka nebyla nalezena.' }
    case 'P0001':
      return { status: 400, error: 'Napište prosím zprávu, nebo přidejte soubor.' }
    default:
      console.error('[chat] zápis zprávy selhal:', err instanceof Error ? err.name : 'unknown')
      return { status: 500, error: 'Zprávu se nepodařilo odeslat. Zkuste to prosím znovu.' }
  }
}
