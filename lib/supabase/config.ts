/**
 * Supabase je v ZakazIQ **jen poskytovatel přihlášení do admin konzole** (R-105).
 * Data zůstávají v Neonu (R-002): schéma `public` (admin), `ws` (Workspace)
 * i `portal` (klientský prostor). Do databáze Supabase se nic nepíše ani nečte.
 *
 * Klíč je publishable (`sb_publishable_…`), tedy veřejný — není to tajemství.
 * Přesto se drží na serveru: přihlášení i dvoufázové ověření běží v server
 * actions, takže prohlížeč na Supabase vůbec nesahá a CSP se nemění (B13).
 *
 * Env se čte **ve funkci, ne do konstanty při načtení modulu** — jinak záleží
 * na tom, kdy se modul poprvé naimportoval.
 */

export const supabaseUrl = (): string => process.env.SUPABASE_URL ?? ''
export const supabasePublishableKey = (): string => process.env.SUPABASE_PUBLISHABLE_KEY ?? ''

/** E-mail jediného admina (R-001). Bez něj se do adminu nedostane nikdo. */
export const adminEmail = (): string => process.env.ADMIN_EMAIL ?? ''

export function supabaseConfigured(): boolean {
  return supabaseUrl().length > 0 && supabasePublishableKey().length > 0
}

/** Porovnání e-mailu bez ohledu na velikost písmen a okolní mezery. */
export function isAdminEmail(email: string | null | undefined): boolean {
  const expected = adminEmail().trim().toLowerCase()
  if (!email || !expected) return false
  return email.trim().toLowerCase() === expected
}
