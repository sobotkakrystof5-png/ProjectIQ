import { LogOut } from 'lucide-react'
import { SignOutButton } from '@/components/auth/sign-out-button'

export function LogoutButton() {
  return (
    <SignOutButton
      target="admin"
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-800 transition-colors"
    >
      <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
      <span className="hidden sm:block">Odhlásit</span>
      <span className="sr-only sm:hidden">Odhlásit</span>
    </SignOutButton>
  )
}
