import { signOutAction, type SignOutTarget } from '@/lib/auth/actions'

/**
 * Odhlášení jako formulář se server action — funguje i bez JavaScriptu.
 * `target` určuje, kam se po odhlášení přejde (lib/auth/actions.ts).
 */
export function SignOutButton({
  target,
  className,
  children,
}: {
  target: SignOutTarget
  className?: string
  children: React.ReactNode
}) {
  return (
    <form action={signOutAction} className="contents">
      <input type="hidden" name="target" value={target} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  )
}
