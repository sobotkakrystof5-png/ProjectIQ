import 'server-only'
import { adminDb, type AdminRow } from '@/lib/admin/db'
import { sendBrandedEmail } from '@/lib/email'
import { getSurveyUrl } from '@/lib/utils'

/**
 * Dotazník spokojenosti (AD16, migrace 112).
 *
 * Dosud se posílal **jen jednou**, v okamžiku ručního „Přidat do dokončených",
 * a když klient neodpověděl, musel se odkaz kopírovat ručně. Zaplacená zakázka
 * tak mohla skončit, aniž by se klienta kdokoli zeptal.
 *
 * Od AD16 se dotazník zařadí k odeslání sám, jakmile zakázka skončí
 * (uzavření nebo stav „Hotovo"/„Zaplaceno"), a po sedmi dnech odejde **jedna**
 * připomínka. Pak už nic.
 *
 * Dvě pojistky:
 *  - **„Zpět" ho zruší.** Mezi akcí a odesláním je odklad; po něm se stav
 *    přečte z databáze znovu (stejně jako u e-mailu o změně stavu, R-097).
 *  - **Dvakrát neodejde.** `survey_requested_at` nastavuje týž UPDATE, který
 *    zakázku vybere, takže souběžné volání druhý e-mail nevyrobí.
 *
 * Dotazy jsou psané jako `{ text, params }`, ne tagem — potřebují sdílet
 * podmínky (`ELIGIBLE`, `FINISHED`), a ty by se v tagu musely opisovat.
 * Do textu nejde nic z prohlížeče, jen konstanty z tohohle souboru.
 */

/** Kolik se čeká, než dotazník odejde — okno na „Zpět". */
export const SURVEY_SEND_DELAY_MS = 15_000
/** Po kolika dnech bez odpovědi odejde jediná připomínka. */
export const SURVEY_REMINDER_DAYS = 7
/**
 * Jak staré zakázky smí připomínka ještě potkat. Kdyby cron týden neběžel,
 * nemá se po obnovení rozletět do historie.
 */
const SURVEY_REMINDER_MAX_AGE_DAYS = 60
/** Strop na jeden běh cronu. Víc dotazníků za den nikdy nevznikne. */
const SURVEY_REMINDER_LIMIT = 20

type SurveyTarget = {
  client_name: string
  client_email: string
  survey_token: string
  title: string
}

/** Migrace 112 ještě neproběhla — sloupec chybí. */
function isMissingColumn(err: unknown): boolean {
  return (err as { code?: string })?.code === '42703'
}

const TARGET_COLUMNS = `client_name, client_email, survey_token::text AS survey_token,
  coalesce(nullif(btrim(coalesce(description, '')), ''), client_name) AS title`

/** Podmínka „tahle zakázka skončila" — uzavřená, nebo hotová či zaplacená. */
const FINISHED = `(closed_at IS NOT NULL OR status IN ('done', 'paid'))`
/** Komu se dotazník posílá: klientská zakázka s e-mailem, ne nepotvrzená poptávka. */
const ELIGIBLE = `project_type = 'client' AND client_email IS NOT NULL
  AND btrim(client_email) <> '' AND NOT lead_pending`

async function one<T extends AdminRow>(text: string, params: unknown[]): Promise<T | undefined> {
  const [rows] = await adminDb.batch([{ text, params }])
  return rows[0] as T | undefined
}

async function sendRequestEmail(target: SurveyTarget, reminder: boolean): Promise<void> {
  await sendBrandedEmail({
    to: target.client_email,
    subject: reminder ? 'Ještě dotazník k zakázce – ZakazIQ' : 'Děkuji za spolupráci – ZakazIQ',
    heading: reminder ? 'Našli byste pár minut?' : 'Děkuji za spolupráci!',
    intro: reminder
      ? `Dobrý den, ${target.client_name}, před týdnem jsem vám poslal krátký dotazník k zakázce. Kdybyste na něj našel chvilku, moc mi to pomůže — zabere pár minut. Pokud ho vyplňovat nechcete, nic se neděje, víc už vám s ním psát nebudu.`
      : `Dobrý den, ${target.client_name}, zakázka je hotová a moc vám děkuji za spolupráci — byla mi potěšením. Budu rád, když si najdete chvilku a vyplníte krátký dotazník spokojenosti. Pomůže mi to zlepšovat mé služby a zabere jen pár minut. Na konci můžete napsat i referenci, kterou se mnou chcete sdílet.`,
    fields: [{ label: 'Zakázka', value: target.title }],
    ctas: [
      {
        label: reminder ? 'Vyplnit dotazník' : 'Vyplnit dotazník spokojenosti',
        href: getSurveyUrl(target.survey_token),
      },
    ],
  })
}

/**
 * Pošle dotazník, pokud zakázka pořád splňuje podmínky a ještě neodešel.
 *
 * Volá se z `after()` po odkladu, takže „Zpět" (vrácení stavu nebo otevření
 * zakázky) e-mail zastaví — podmínka `FINISHED` se čte teď, ne v okamžiku
 * kliknutí.
 *
 * `fallbackWithoutColumn`: dokud není migrace 112, zámek proti dvojímu
 * odeslání neexistuje. Tehdy pošle jen uzavření zakázky (jediná cesta, která
 * e-mail posílala i před AD16) — změna stavu mlčí, aby klient nedostal
 * dotazník dvakrát.
 */
export async function sendSurveyRequest(
  projectId: string,
  options: { fallbackWithoutColumn?: boolean } = {},
): Promise<boolean> {
  let target: SurveyTarget | undefined
  let claimedAt: string | null = null

  try {
    const row = await one<SurveyTarget & { survey_requested_at: string }>(
      `UPDATE projects SET survey_requested_at = now()
       WHERE id = $1
         AND survey_requested_at IS NULL
         AND ${ELIGIBLE}
         AND ${FINISHED}
       RETURNING ${TARGET_COLUMNS}, survey_requested_at`,
      [projectId],
    )
    target = row
    claimedAt = row?.survey_requested_at ?? null
  } catch (err) {
    if (!isMissingColumn(err)) throw err
    if (!options.fallbackWithoutColumn) return false
    target = await one<SurveyTarget>(
      `SELECT ${TARGET_COLUMNS} FROM projects
       WHERE id = $1 AND ${ELIGIBLE} AND ${FINISHED} LIMIT 1`,
      [projectId],
    )
  }

  if (!target) return false

  try {
    await sendRequestEmail(target, false)
    return true
  } catch (err) {
    console.error(
      '[Dotazník] E-mail se nepodařilo odeslat.',
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    )
    // Zámek se vrací, aby šlo poslat znovu — ale jen ten svůj: mezitím mohla
    // zakázka projít další akcí a zapsat nové razítko.
    if (claimedAt !== null) {
      await adminDb
        .batch([
          {
            text: `UPDATE projects SET survey_requested_at = NULL
                   WHERE id = $1 AND survey_requested_at = $2`,
            params: [projectId, claimedAt],
          },
        ])
        .catch(() => [])
    }
    return false
  }
}

export type SurveyReminderResult = { sent: number; failed: number }

/**
 * Jedna připomínka po sedmi dnech — pouští ji denní cron `send-reminders`
 * spolu s ostatními (vlastní cron se kvůli jednomu dotazu nezakládá, R-006).
 *
 * Řádek se „claimne" (`survey_reminded_at`) týmž dotazem, který ho vybere,
 * takže dvě souběžná volání cronu nepošlou dvě připomínky.
 */
export async function remindPendingSurveys(): Promise<SurveyReminderResult> {
  let rows: SurveyTarget[]
  try {
    const [result] = await adminDb.batch([
      {
        text: `UPDATE projects SET survey_reminded_at = now()
               WHERE id IN (
                 SELECT id FROM projects
                 WHERE survey_requested_at IS NOT NULL
                   AND survey_reminded_at IS NULL
                   AND survey_requested_at < now() - make_interval(days => $1)
                   AND survey_requested_at > now() - make_interval(days => $2)
                   AND ${ELIGIBLE}
                   AND ${FINISHED}
                   AND NOT EXISTS (SELECT 1 FROM project_surveys s WHERE s.project_id = projects.id)
                 ORDER BY survey_requested_at
                 LIMIT $3
               )
               RETURNING ${TARGET_COLUMNS}`,
        params: [SURVEY_REMINDER_DAYS, SURVEY_REMINDER_MAX_AGE_DAYS, SURVEY_REMINDER_LIMIT],
      },
    ])
    rows = result as unknown as SurveyTarget[]
  } catch (err) {
    if (isMissingColumn(err)) return { sent: 0, failed: 0 }
    throw err
  }

  const results = await Promise.allSettled(rows.map((row) => sendRequestEmail(row, true)))
  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed > 0) console.error(`[Dotazník] ${failed} připomínek se nepodařilo odeslat.`)
  return { sent: results.length - failed, failed }
}
