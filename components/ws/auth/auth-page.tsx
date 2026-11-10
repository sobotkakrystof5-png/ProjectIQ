import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from './auth-shell'
import { AuthForm, type AuthMode, type AuthPaths } from './auth-form'
import { getAuthIdentity } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth/redirect'
import { authNoticeFromQuery } from '@/lib/auth/messages'

export type AuthSearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Stránka přihlášení / registrace / obnovy hesla (R-080) — společná pro
 * Workspace a klientský prostor, liší se jen cestami a výchozím cílem.
 */
export async function AuthPage({
  mode,
  paths,
  defaultNext,
  searchParams,
  google = true,
}: {
  mode: AuthMode
  paths: AuthPaths
  defaultNext: string
  searchParams: AuthSearchParams
  google?: boolean
}) {
  const sp = await searchParams
  const next = safeNextPath(typeof sp.next === 'string' ? sp.next : null, defaultNext)
  const identity = await getAuthIdentity()

  // Přihlášený na přihlášení nebo registraci nemá co dělat.
  if (identity && (mode === 'sign-in' || mode === 'sign-up')) redirect(next)

  // Nové heslo jde nastavit jen po kliknutí na odkaz z e-mailu (ten přihlásí).
  if (mode === 'new-password' && !identity) {
    return (
      <AuthShell>
        <div className="rounded-panel border border-navy-100 bg-surface px-6 py-8 sm:px-8">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">Odkaz už neplatí</h1>
          <p className="mt-2 text-[15px] text-quiet">Nechte si prosím poslat nový odkaz na nastavení hesla.</p>
          <Link
            href={`${paths.reset}?next=${encodeURIComponent(next)}`}
            className="mt-6 inline-flex h-11 items-center rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white hover:bg-navy-800"
          >
            Poslat nový odkaz
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthForm mode={mode} paths={paths} next={next} google={google} notice={authNoticeFromQuery(sp.chyba)} />
    </AuthShell>
  )
}
