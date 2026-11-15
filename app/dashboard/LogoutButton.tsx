import { LogOut } from 'lucide-react'

import { signOutAdmin } from '@/app/(auth)/login/actions'

/**
 * Odhlášení je server action — session ruší Supabase na serveru a smaže
 * cookie. Proto to není klientská komponenta jako za NextAuthu.
 */
export function LogoutButton() {
  return (
    <form action={signOutAdmin}>
      <button
        type="submit"
        className="flex min-h-11 items-center gap-1.5 text-xs text-quiet transition-colors hover:text-navy-800"
        title="Odhlásit"
      >
        <LogOut size={14} strokeWidth={1.5} />
        <span className="hidden sm:block">Odhlásit</span>
      </button>
    </form>
  )
}
