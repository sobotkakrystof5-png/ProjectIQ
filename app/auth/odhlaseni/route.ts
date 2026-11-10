import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { WS_SIGN_IN_PATH } from '@/lib/ws/paths'
import { PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

// Relace zrušená z jiného zařízení (Odhlásit všude, R-081). JWT v cookie má
// podpis pořád platný, takže ho server komponenta nesmaže a přihlašovací
// stránka by člověka poslala zpátky — smyčka. Tahle route cookies smaže
// (route handler je zapsat smí) a pošle na přihlášení s vysvětlením.
//
// Odhlašuje vždy: odkaz sem z cizího webu umí jen odhlásit (žádná data ani
// změna účtu), to je přijaté riziko (.claude/security/DECISIONS.md #023).
// Cíl je pevný podle `kam`, nikdy adresa z URL.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const signIn = req.nextUrl.searchParams.get('kam') === 'klient' ? PORTAL_SIGN_IN_PATH : WS_SIGN_IN_PATH
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
  const url = new URL(signIn, req.nextUrl.origin)
  url.searchParams.set('chyba', 'odhlaseno')
  return NextResponse.redirect(url)
}
