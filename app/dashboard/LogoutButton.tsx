'use client'

import { signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="flex min-h-11 items-center gap-1.5 text-xs text-quiet transition-colors hover:text-navy-800"
      title="Odhlásit"
    >
      <LogOut size={14} strokeWidth={1.5} />
      <span className="hidden sm:block">Odhlásit</span>
    </button>
  )
}
