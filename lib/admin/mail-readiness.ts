import 'server-only'
import { googleStatus } from '@/lib/admin/google/oauth'
import { vizeonMailConfigured } from '@/lib/admin/vizeon-mail'

/**
 * Může okno „Poslat e-mail" poslat i schůzku s Google Meet? Potřebuje propojený
 * Google účet (Profil) a odesílání z vizeon.cz. Portfolio a Nabídka jdou i bez
 * toho. Jedno místo pro všechny obrazovky, kde okno je (R-121).
 */
export async function loadMailReadiness(): Promise<{ google: boolean; mail: boolean }> {
  const google = await googleStatus()
  return { google: google.configured === true && google.connected, mail: vizeonMailConfigured() }
}
