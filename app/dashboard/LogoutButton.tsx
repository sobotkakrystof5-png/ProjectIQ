'use client'

import { signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-800 transition-colors"
      title="Odhlásit"
    >
      <LogOut size={14} strokeWidth={1.5} />
      <span className="hidden sm:block">Odhlásit</span>
    </button>
  )
}
