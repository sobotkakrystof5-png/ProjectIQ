'use client'

import { usePathname } from 'next/navigation'
import { ErrorScreen, SUPPORT_HINT } from '@/components/ws/error-screen'

// Chyba obrazovky byznysu: postranní menu (layout) zůstává, jde se vrátit na Dnes.
export default function BusinessError({ retry }: { error: unknown; retry: () => void }) {
  const slug = usePathname()?.split('/')[2] ?? ''
  return <ErrorScreen description={SUPPORT_HINT} retry={retry} home={slug ? { href: `/w/${slug}`, label: 'Zpět na Dnes' } : undefined} />
}
