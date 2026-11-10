// Údaje pro právní texty, patičku a záznam o zpracování na jednom místě (R-079).
// Provozovatel podle ARES (ověřeno 2026-11-03), regiony podle dashboardů služeb
// (Supabase eu-central-1, Vercel fra1 ve vercel.json, Resend EU). Při změně služby
// upravit seznam a dát vědět uživatelům (zpracovatelská smlouva, Další zpracovatelé).
import { COMPANY_ID, SUPPORT_EMAIL } from './content'

export { DATA_LOCATION } from './content'

export const OPERATOR = {
  name: 'Kryštof Sobotka',
  address: 'Kamenice 64, 294 04 Dobšín',
  companyId: COMPANY_ID,
  register: 'zapsaný v živnostenském rejstříku vedeném Magistrátem města Mladá Boleslav',
  email: SUPPORT_EMAIL,
} as const

/** Jedna věta s identifikací provozovatele (patička, zpracovatelská smlouva, záznam o zpracování). */
export const OPERATOR_LINE = `${OPERATOR.name}, ${OPERATOR.address}, IČO ${OPERATOR.companyId}`

/** Verze právních textů. Při změně obsahu posunout a změnu oznámit e-mailem (podmínky, Změny podmínek). */
export const LEGAL_VERSION = '7. 11. 2026'

export type Processor = {
  name: string
  /** Co pro ZakazIQ dělá. */
  role: string
  /** Kde údaje zpracovává. */
  where: string
  /** Zpracovává i údaje zákazníků firem (další zpracovatel ve zpracovatelské smlouvě). */
  customerData: boolean
}

export const PROCESSORS: readonly Processor[] = [
  { name: 'Vercel', role: 'provoz aplikace a webu', where: 'EU (Frankfurt), společnost z USA', customerData: true },
  { name: 'Supabase', role: 'databáze a přihlášení do účtu', where: 'EU (Frankfurt), společnost z USA', customerData: true },
  { name: 'Resend', role: 'odesílání e-mailů z aplikace', where: 'EU (Irsko), společnost z USA', customerData: true },
  {
    name: 'Anthropic',
    role: 'přepis přijatých faktur z PDF, jen když ho použijete',
    where: 'USA',
    customerData: true,
  },
  {
    name: 'Stripe',
    role: 'platby předplatného (jen údaje o vás, ne o vašich zákaznících)',
    where: 'EU (Irsko) a USA',
    customerData: false,
  },
]

/** Přenos mimo EU — společná věta pro ochranu údajů i zpracovatelskou smlouvu. */
export const TRANSFER_BASIS =
  'Pokud se údaje dostanou do USA, chrání je rozhodnutí Evropské komise o odpovídající ochraně (EU-US Data Privacy Framework) u certifikovaných společností, jinak standardní smluvní doložky schválené Evropskou komisí.'
