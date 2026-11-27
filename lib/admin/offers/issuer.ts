import 'server-only'
import { loadIssuerProfile } from '@/lib/admin/invoice-issue'
import type { OfferIssuer } from '@/components/offers/offer-document'

/**
 * Kdo nabídku dává: údaje z profilu dodavatele (Faktury › Údaje dodavatele, R-142).
 * Značka (VIZEON) nahoře, jméno, e-mail a telefon v kontaktu. Bez profilu
 * zůstane jen to, co jde poznat jistě (B10): žádné vymyšlené údaje.
 */
export async function loadOfferIssuer(): Promise<OfferIssuer> {
  const { profile } = await loadIssuerProfile().catch(() => ({ profile: null }))
  return {
    brand: profile?.tradeName?.trim() || profile?.name?.trim() || 'Nabídka',
    person: profile?.name?.trim() ?? '',
    email: profile?.email?.trim() ?? '',
    phone: profile?.phone?.trim() ?? '',
    web: profile?.web?.trim() ?? '',
    vatPayer: profile?.vatPayer === true,
  }
}
