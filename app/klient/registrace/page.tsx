import { redirect } from 'next/navigation'
import { PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

// Volná registrace není: přístup se zakládá z pozvánky (/klient/pozvanka/<kód>).
// Adresa zůstává, aby staré odkazy z doby Clerku nevedly na 404.
export default function KlientRegistracePage() {
  redirect(PORTAL_SIGN_IN_PATH)
}
