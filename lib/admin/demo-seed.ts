// Ukázková data pro admin konzoli (AD00): fiktivní zakázky, hovory, termíny,
// faktury, náklady, dotazník a projekty Hubu kolem dneška, aby šlo admin
// otevřít v prohlížeči na čisté databázi.
//
// Spouští se skriptem `node scripts/admin-seed.mjs --ano` (Node 24 umí .ts
// sám). Proto tenhle soubor nemá žádný runtime import — jen typy — a časy
// počítá Postgres (pražský čas přes AT TIME ZONE).
//
// Všechno je jasně označené a jde smazat: zakázky, hovory, termíny, faktury,
// náklady i projekty Hubu nesou v poznámce DEMO_MARK, telefony jsou
// +420000000xxx a e-maily @example.cz. Seed nejdřív smaže předchozí ukázková
// data, takže jde pustit opakovaně. Skutečných řádků se nedotkne.

export const DEMO_MARK = '[ukázková data]'

/** Stejný tvar, jaký čeká neon `sql.query(text, params)`. */
export type AdminQuery = { text: string; params: unknown[] }

export type DemoScope = {
  /** Dnešní datum v Praze, YYYY-MM-DD. */
  today: string
}

/** Surový úryvek SQL (datum, poddotaz) — na rozdíl od hodnoty se nepředává jako parametr. */
type Raw = { sql: string }
const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null && 'sql' in v

// Vlastní mini `q` — runtime import tu nesmí být (soubor se spouští bez překladu).
function q(strings: TemplateStringsArray, ...values: unknown[]): AdminQuery {
  let text = strings[0]
  const params: unknown[] = []
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (isRaw(value)) {
      text += value.sql + strings[i + 1]
    } else {
      params.push(value)
      text += `$${params.length}${strings[i + 1]}`
    }
  }
  return { text, params }
}

/** `[ukázková data] text` — jeden tvar poznámky pro všechny tabulky. */
const mark = (text: string) => `${DEMO_MARK} ${text}`

/** Jen ukázkové řádky: `notes LIKE '%[ukázková data]%'`. */
const marked = (column: string) => ({ sql: `${column} LIKE '%${DEMO_MARK}%'` })

/** Pražský čas z dneška + dní a hodiny. */
const at = (today: string, days: number, time: string): Raw => ({
  sql: `(('${today}'::date + ${days} * INTERVAL '1 day' + TIME '${time}') AT TIME ZONE 'Europe/Prague')`,
})

/** Datum z dneška + dní. */
const day = (today: string, days: number): Raw => ({
  sql: `('${today}'::date + ${days} * INTERVAL '1 day')::date`,
})

/** Zakázka ukázky podle jména klienta. */
const projectByClient = (name: string): Raw => ({
  sql: `(SELECT id FROM projects WHERE notes LIKE '%${DEMO_MARK}%' AND client_name = '${name}' LIMIT 1)`,
})

/**
 * Smaže jen ukázková data (pořadí kvůli cizím klíčům).
 * Nikdy nemaže řádek bez značky DEMO_MARK.
 */
export function demoCleanupQueries(): AdminQuery[] {
  const demoNotes = marked('notes')
  return [
    // Děti zakázek — některé nemají ON DELETE CASCADE, proto ručně a dřív.
    q`DELETE FROM client_requests WHERE project_id IN (SELECT id FROM projects WHERE ${demoNotes})`,
    q`DELETE FROM project_notes WHERE project_id IN (SELECT id FROM projects WHERE ${demoNotes})`,
    q`DELETE FROM consultation_slots WHERE project_id IN (SELECT id FROM projects WHERE ${demoNotes})`,
    q`DELETE FROM client_messages WHERE project_id IN (SELECT id FROM projects WHERE ${demoNotes})`,
    q`DELETE FROM progress_updates WHERE project_id IN (SELECT id FROM projects WHERE ${demoNotes})`,
    q`DELETE FROM client_feedback WHERE project_id IN (SELECT id FROM projects WHERE ${demoNotes})`,
    q`DELETE FROM project_activity WHERE project_id IN (SELECT id FROM projects WHERE ${demoNotes})`,
    // Dotazník visí na dokončené zakázce.
    q`DELETE FROM project_surveys WHERE completed_project_id IN (SELECT id FROM completed_projects WHERE ${demoNotes})`,
    // Peníze: transakce se váží na faktury i náklady, proto jdou první.
    q`DELETE FROM finance_transactions WHERE ${marked('note')}`,
    q`DELETE FROM invoices WHERE ${marked('note')}`,
    q`DELETE FROM costs WHERE ${marked('description')}`,
    q`DELETE FROM completed_projects WHERE ${demoNotes}`,
    // Hovory a kalendář: vazba je obousměrná, proto se nejdřív rozpojí.
    q`UPDATE client_leads SET calendar_event_id = NULL WHERE ${demoNotes}`,
    q`DELETE FROM lead_notes WHERE lead_id IN (SELECT id FROM client_leads WHERE ${demoNotes})`,
    q`DELETE FROM calendar_events WHERE ${marked('description')}`,
    q`DELETE FROM client_leads WHERE ${demoNotes}`,
    q`DELETE FROM projects WHERE ${demoNotes}`,
    q`DELETE FROM personal_projects WHERE ${demoNotes}`,
  ]
}

/** Smaže starou ukázku a vloží novou. */
export function demoSeedQueries({ today }: DemoScope): AdminQuery[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('today musí být YYYY-MM-DD')
  return [...demoCleanupQueries(), ...insertQueries(today)]
}

function insertQueries(today: string): AdminQuery[] {
  const out: AdminQuery[] = []

  // --- Zakázky: 2 VIZEON + 1 ALTENO -----------------------------------------
  out.push(
    q`
      INSERT INTO projects (client_name, description, focus, status, progress, price, paid, deadline, notes,
                            client_email, client_phone, service_type, project_url, source, estimated_costs,
                            deposit_amount, deposit_paid, vizeon_confirmed, business, invoiced_on_ico)
      VALUES
        (${'Kavárna Ukázková'}, ${'Jednostránkový web s menu a objednávkou dortů na míru.'},
         ${'web'}, ${'in_progress'}, 45, 24000, false, ${day(today, 12)}, ${mark('zakázka pro vyzkoušení obrazovek')},
         ${'kavarna@example.cz'}, ${'+420000000201'}, ${'Web na míru'}, NULL, ${'web'}, 1200,
         8000, true, true, ${'vizeon'}, true),
        (${'Keramika Vzorová'}, ${'E-shop s ruční keramikou, platby kartou a výdejní místa.'},
         ${'eshop'}, ${'review'}, 80, 48000, false, ${day(today, 4)}, ${mark('zakázka pro vyzkoušení obrazovek')},
         ${'keramika@example.cz'}, ${'+420000000202'}, ${'E-shop'}, ${'https://example.cz/keramika'}, ${'manual'}, 2400,
         12000, true, true, ${'vizeon'}, false),
        (${'Zámečnictví Zkušební'}, ${'Automatické odpovědi na poptávky a napojení na kalendář.'},
         ${'automatizace'}, ${'new'}, 0, 18000, false, ${day(today, 21)}, ${mark('zakázka pro vyzkoušení obrazovek')},
         ${'zamecnictvi@example.cz'}, ${'+420000000203'}, ${'AI automatizace'}, NULL, ${'web'}, NULL,
         NULL, false, false, ${'alteno'}, false)
    `,
  )

  const kavarna = projectByClient('Kavárna Ukázková')
  const keramika = projectByClient('Keramika Vzorová')

  out.push(
    q`
      INSERT INTO project_notes (project_id, content, author, progress_snapshot)
      VALUES
        (${kavarna}, ${mark('Telefonát: klientka chce fotky dortů na výšku, dodá je v pátek.')}, ${'Kryštof Sobotka'}, 30),
        (${kavarna}, ${mark('Schůzka: menu bude jen PDF, ne editovatelné. Odsouhlasená barevnost.')}, ${'Kryštof Sobotka'}, 45)
    `,
    q`
      INSERT INTO client_messages (project_id, content)
      VALUES (${kavarna}, ${mark('Hotové menu je na webu, mrkněte na něj.')})
    `,
    q`
      INSERT INTO progress_updates (project_id, progress_from, progress_to, description)
      VALUES (${kavarna}, 30, 45, ${mark('Hotová úvodní stránka a menu.')})
    `,
    q`
      INSERT INTO client_requests (project_id, source, raw_text, status, ai_status, ai_kind, ai_summary, ai_prompt)
      VALUES (${kavarna}, ${'text'},
              ${mark('Dobrý den, šlo by na web přidat odkaz na náš Instagram? Děkuji.')},
              ${'new'}, ${'ready'}, ${'text_change'},
              ${mark('Klient chce do patičky odkaz na Instagram.')},
              ${mark('Přidej do patičky odkaz na Instagram klienta, stejný styl jako ostatní odkazy.')})
    `,
    // Konzultace z portálu — mimo všechna okna kalendářních termínů níže.
    q`
      INSERT INTO consultation_slots (project_id, scheduled_at, channel, client_wish, meeting_link, client_email)
      VALUES
        (${kavarna}, ${at(today, 1, '12:00')}, ${'meet'}, ${mark('Projít fotky k menu')}, NULL, ${'kavarna@example.cz'}),
        (${keramika}, ${at(today, 4, '13:00')}, ${'phone'}, ${mark('Schválení e-shopu před spuštěním')}, NULL, ${'keramika@example.cz'})
    `,
  )

  // --- Hovory: 8 leadů ve všech stavech -------------------------------------
  const leads: Array<[string, string, string, string, string, string, number | null, number, string]> = [
    ['Pekárna Ukázková', 'Jana Ukázková', '+420000000301', 'pekarna@example.cz', 'hot', 'Zavolat kvůli nabídce webu', 35000, 0, 'call'],
    ['Autoservis Zkušební', 'Petr Zkušební', '+420000000302', 'autoservis@example.cz', 'warm', 'Poslat portfolio', 22000, 1, 'email'],
    ['Studnařství Vzorové', 'Marie Vzorová', '+420000000303', 'studny@example.cz', 'cold', 'Ozvat se po sezóně', null, 14, 'call'],
    ['Kosmetika Testová', 'Tereza Testová', '+420000000304', 'kosmetika@example.cz', 'waiting', 'Čeká na schválení rozpočtu', 18000, 7, 'other'],
    ['Úklid Pokusný', 'Karel Pokusný', '+420000000305', 'uklid@example.cz', 'converted', 'Podepsáno, předat do zakázek', 26000, -3, 'meeting'],
    ['Truhlářství Demo', 'Eva Demo', '+420000000306', 'truhlarstvi@example.cz', 'lost', 'Vybrali si jiného dodavatele', null, -10, 'other'],
    ['Kadeřnictví Ukázkové', 'Lucie Ukázková', '+420000000307', 'kadernictvi@example.cz', 'hot', 'Osobní schůzka v salonu', 29000, 3, 'meeting'],
    ['Likvidace Vzorová', 'Tomáš Vzorový', '+420000000308', 'likvidace@example.cz', 'warm', 'Online schůzka k rozsahu', 41000, 1, 'online'],
  ]
  for (const [company, contact, phone, email, status, action, value, offset, type] of leads) {
    out.push(
      q`
        INSERT INTO client_leads (company_name, contact_name, phone, email, lead_status, next_action,
                                  next_action_date, next_action_time, next_action_type, notes, estimated_value, call_answered)
        VALUES (${company}, ${contact}, ${phone}, ${email}, ${status}, ${action},
                ${day(today, offset)}, ${'10:00'}, ${type}, ${mark('kontakt pro vyzkoušení Hovorů')}, ${value},
                ${status === 'converted' ? true : status === 'lost' ? false : null})
      `,
    )
  }
  out.push(
    q`
      INSERT INTO lead_notes (lead_id, content)
      VALUES ((SELECT id FROM client_leads WHERE ${marked('notes')} AND company_name = ${'Pekárna Ukázková'}),
              ${mark('Volala sama, chce web do konce měsíce.')})
    `,
  )

  // --- Kalendář: 12 termínů kolem dneška, nepřekrývají se -------------------
  // Guard check_calendar_overlap hlídá překryv napříč byznysy i s konzultacemi.
  const events: Array<[string, number, string, string, string, string]> = [
    ['Konzultace k webu kavárny', -3, '09:30', '10:30', 'manual', 'vizeon'],
    ['Předání e-shopu Keramika', -2, '13:00', '14:00', 'manual', 'vizeon'],
    ['Telefonát: poptávka zámečnictví', -1, '10:00', '11:00', 'manual', 'alteno'],
    ['Schůzka s pekárnou', 0, '09:00', '10:00', 'manual', 'vizeon'],
    ['Nabídka pro autoservis', 0, '11:00', '12:00', 'manual', 'alteno'],
    ['Soustředěná práce', 0, '14:00', '15:30', 'block', 'vizeon'],
    ['Fotky do menu', 1, '08:30', '09:30', 'manual', 'vizeon'],
    ['Online schůzka: likvidace', 1, '15:00', '16:00', 'manual', 'alteno'],
    ['Kontrola e-shopu', 2, '11:00', '12:00', 'manual', 'vizeon'],
    ['Schůzka v salonu', 3, '16:00', '17:00', 'manual', 'vizeon'],
    ['Dovolená', 5, '10:00', '11:00', 'block', 'vizeon'],
    ['Nasazení webu kavárny', 7, '09:00', '10:00', 'manual', 'vizeon'],
  ]
  for (const [title, offset, from, to, kind, business] of events) {
    out.push(
      q`
        INSERT INTO calendar_events (title, description, starts_at, ends_at, event_type, business)
        VALUES (${title}, ${mark('termín pro vyzkoušení kalendáře')},
                ${at(today, offset, from)}, ${at(today, offset, to)}, ${kind}, ${business})
      `,
    )
  }
  // Dva termíny ukazují vazbu kalendář ↔ Hovory (migrace 051).
  out.push(
    q`
      UPDATE calendar_events e SET lead_id = l.id
      FROM client_leads l
      WHERE ${marked('e.description')}
        AND ${marked('l.notes')}
        AND ((e.title = ${'Schůzka s pekárnou'} AND l.company_name = ${'Pekárna Ukázková'})
          OR (e.title = ${'Schůzka v salonu'} AND l.company_name = ${'Kadeřnictví Ukázkové'}))
    `,
    q`
      UPDATE client_leads l SET calendar_event_id = e.id
      FROM calendar_events e
      WHERE e.lead_id = l.id AND ${marked('l.notes')}
    `,
  )

  // --- Dokončené zakázky a dotazník ----------------------------------------
  out.push(
    q`
      INSERT INTO completed_projects (title, client_name, company, completed_at, amount, difficulty, time_invested,
                                      notes, project_type, client_email, deposit_amount, estimated_hours)
      VALUES
        (${'Web pro truhlářství'}, ${'Eva Demo'}, ${'Truhlářství Demo'}, ${day(today, -40)}, 32000, 6, 28,
         ${mark('dokončená zakázka pro vyzkoušení Dokončených')}, ${'client'}, ${'truhlarstvi@example.cz'}, 10000, 30),
        (${'Rezervační systém pro úklid'}, ${'Karel Pokusný'}, ${'Úklid Pokusný'}, ${day(today, -12)}, 26000, 7, 34,
         ${mark('dokončená zakázka pro vyzkoušení Dokončených')}, ${'client'}, ${'uklid@example.cz'}, NULL, 32)
    `,
    q`
      INSERT INTO project_surveys (completed_project_id, rating_cooperation, rating_speed, rating_design,
                                   rating_functionality, rating_reliability, rating_flexibility, reference_text, consent)
      VALUES ((SELECT id FROM completed_projects WHERE ${marked('notes')} AND title = ${'Web pro truhlářství'}),
              5, 5, 4, 5, 5, 4, ${mark('Spolupráce byla rychlá a web máme přesně podle představ.')}, true)
    `,
  )

  // --- Faktury: 6, z toho 2 po splatnosti ----------------------------------
  const invoices: Array<[string, string, number, number, number | null, number, string]> = [
    ['UKAZKA-2026-001', 'Kavárna Ukázková', -50, -36, -30, 8000, 'CZK'],
    ['UKAZKA-2026-002', 'Keramika Vzorová', -40, -26, -24, 12000, 'CZK'],
    ['UKAZKA-2026-003', 'Truhlářství Demo', -35, -21, null, 32000, 'CZK'],
    ['UKAZKA-2026-004', 'Úklid Pokusný', -28, -14, null, 26000, 'CZK'],
    ['UKAZKA-2026-005', 'Pekárna Ukázková', -5, 9, null, 15000, 'CZK'],
    ['UKAZKA-2026-006', 'Likvidace Vzorová', -2, 12, null, 400, 'EUR'],
  ]
  for (const [number, client, issued, due, paid, amount, currency] of invoices) {
    out.push(
      q`
        INSERT INTO invoices (invoice_number, client_name, client_ico, issued_on, due_on, paid_on, amount, currency, note)
        VALUES (${number}, ${client}, ${'00000000'}, ${day(today, issued)}, ${day(today, due)},
                ${paid === null ? null : day(today, paid)}, ${amount}, ${currency},
                ${mark('faktura pro vyzkoušení archivu')})
      `,
    )
  }

  // --- Náklady a transakce --------------------------------------------------
  const costs: Array<[string, number, string, string]> = [
    ['Domény klientů', 450, 'fixed_monthly', 'domény'],
    ['Hosting Vercel', 580, 'fixed_monthly', 'hosting'],
    ['Licence na fotky', 1200, 'one_time', 'software'],
    ['Nájem kanceláře', 4500, 'fixed_monthly', 'personal'],
  ]
  for (const [name, amount, type, category] of costs) {
    out.push(
      q`
        INSERT INTO costs (name, amount, cost_type, description, category)
        VALUES (${name}, ${amount}, ${type}, ${mark('náklad pro vyzkoušení Nákladů')}, ${category})
      `,
    )
  }

  const transactions: Array<[number, string, string, number, boolean]> = [
    [8000, 'income', 'Zakázky', -30, true],
    [12000, 'income', 'Zakázky', -24, true],
    [26000, 'income', 'Zakázky', -12, false],
    [450, 'expense', 'Domény', -8, false],
    [580, 'expense', 'Hosting', -8, false],
    [1200, 'expense', 'Software', -3, false],
  ]
  for (const [amount, type, category, offset, declared] of transactions) {
    out.push(
      q`
        INSERT INTO finance_transactions (amount, type, category, note, date, declared, area)
        VALUES (${amount}, ${type}, ${category}, ${mark('transakce pro vyzkoušení Financí')},
                ${day(today, offset)}, ${declared}, ${'business'})
      `,
    )
  }

  // --- 3 projekty Hubu ------------------------------------------------------
  const personal: Array<[string, string, string, string, number]> = [
    ['Ukázkový plánovač', 'Malé firmy', 'Papírový diář se ztrácí.', 'mvp', 40],
    ['Ukázková čtečka faktur', 'Živnostníci', 'Opisování faktur z PDF trvá hodiny.', 'idea', 10],
    ['Ukázkový rozpočet', 'Domácnosti', 'Nikdo neví, kam tečou peníze.', 'launch', 75],
  ]
  for (const [name, segment, problem, phase, progress] of personal) {
    out.push(
      q`
        INSERT INTO personal_projects (name, segment, problem, description, phase, progress, notes, monetization)
        VALUES (${name}, ${segment}, ${problem}, ${mark('projekt pro vyzkoušení Hubu')}, ${phase}, ${progress},
                ${mark('projekt pro vyzkoušení Hubu')}, false)
      `,
    )
  }

  return out
}
