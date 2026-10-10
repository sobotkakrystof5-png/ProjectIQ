import type { PublicSchema } from './schema'

// Text promptu „Zkopírovat prompt pro Claude Code“ (S11, plán „Weby postavené
// v Claude Code“, R-024). Vkládá se do Claude Code v projektu webu klienta,
// ten postaví formulář a serverové odeslání na veřejné API. Tajný klíč v něm
// nikdy není — jen název env proměnné ZAKAZIQ_KEY. Podrobná dokumentace API:
// docs/workspace/API.md (z ní čerpá i skill zakaziq-napojeni).

const BOOKING_HELP: Record<PublicSchema['booking']['mode'], string> = {
  slots:
    'Firma má otevírací dobu, termín se vybírá z volných časů. Načti je serverově přes GET /api/public/v1/schema?serviceId=<id služby> (pole booking.slots[].times[].start) a do poptávky pošli vybraný `start`. Když čas mezitím někdo vezme, API vrátí 409 SLOT_TAKEN — ukaž hlášku z `error` a nech vybrat znovu.',
  free:
    'Firma zatím nemá otevírací dobu: zákazník čas navrhne sám. Ukaž výběr dne (dnes až +60 dní) a času po 30 minutách mezi 7:00 a 20:00 a pošli `date` (RRRR-MM-DD) a `time` (HH:MM) v pražském čase. Čas je nepovinný.',
  none: 'Firma nepracuje s termíny: formulář čas nemá (případné datum je jen vlastní kolonka).',
}

export function buildClaudePrompt(input: { apiOrigin: string; schema: PublicSchema }): string {
  const { apiOrigin, schema } = input
  const example: Record<string, unknown> = {
    name: 'Tereza Nováková',
    phone: '+420 777 123 456',
    email: 'tereza@example.cz',
    ...(schema.services[0] ? { serviceId: schema.services[0].id } : {}),
    ...(schema.booking.mode === 'slots' ? { start: '2026-10-12T09:00:00+02:00' } : {}),
    ...(schema.booking.mode === 'free' ? { date: '2026-10-12', time: '09:00' } : {}),
    message: 'Text zprávy od zákazníka',
    fields: Object.fromEntries(
      schema.fields.map((f) => [f.key, f.options?.[0] ?? (f.type === 'number' ? 1 : f.type === 'date' ? '2026-10-20' : '…')]),
    ),
  }
  const current = {
    services: schema.services,
    fields: schema.fields,
    booking: schema.booking.mode === 'slots' ? { mode: 'slots', stepMin: schema.booking.stepMin } : schema.booking,
  }

  return `Napoj formulář poptávek na tomhle webu na ZakazIQ (firma „${schema.business.name}“). Poptávky se pak samy objeví v aplikaci ZakazIQ.

## Jak to funguje
- Formulář odešle data **serverově** (Next.js server action nebo route handler) na \`POST ${apiOrigin}/api/public/v1/requests\`. Z prohlížeče API nevolej.
- Tajný klíč je v env proměnné \`ZAKAZIQ_KEY\` — jen na serveru. Nikdy ho nedávej do kódu, do \`NEXT_PUBLIC_…\`, do logů ani do chybových hlášek. Do \`.env.example\` přidej \`ZAKAZIQ_KEY=\` (prázdné), skutečnou hodnotu vložím do Vercelu sám.
- Hlavičky: \`Authorization: Bearer \${process.env.ZAKAZIQ_KEY}\`, \`Content-Type: application/json\` a \`Idempotency-Key\` (nové UUID pro každé odeslání formuláře, při opakování stejné — poptávka se neuloží dvakrát).
- Úspěch: \`202 { "success": true, "id": "…" }\`. Chyba: \`{ "success": false, "code": "…", "error": "…", "issues": [{ "field": "…", "message": "…" }] }\` — \`error\` i \`message\` jsou česky a pro lidi, ukaž je u formuláře.

## Tělo požadavku
\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`
- \`name\` povinné, k tomu aspoň \`phone\` nebo \`email\`.
- \`serviceId\` je nepovinné (zákazník nemusí vědět), musí být ze seznamu níže.
- \`fields\` = vlastní kolonky firmy podle \`key\`; povinné musí být vyplněné, u \`choice\`/\`select\` jen hodnota z \`options\`.
- Pole \`website\` posílej z neviditelné kolonky formuláře (past na roboty) — vyplněná = robot.

## Termín
${BOOKING_HELP[schema.booking.mode]}

## Aktuální služby a kolonky firmy
\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`
Firma si je může změnit. Aktuální stav vrací \`GET ${apiOrigin}/api/public/v1/schema\` se stejnou hlavičkou Authorization (odpověď smíš cachovat 60 s, třeba \`fetch(…, { next: { revalidate: 60 } })\`).

## Zadání
1. Formulář ve stylu tohohle webu (stejná písma, barvy a komponenty jako zbytek stránek), přístupný a použitelný na telefonu. Pole: jméno, telefon, e-mail, služba, termín podle „Termín“ výše, kolonky firmy (povinné označ), zpráva, skrytá past \`website\`.
2. Server action: validace Zodem (stejná pravidla jako výše a délky polí), odeslání na API s klíčem z env, převzetí chyb z odpovědi. Když \`ZAKAZIQ_KEY\` chybí, zaloguj to na serveru a návštěvníkovi ukaž obecnou hlášku.
3. Po úspěchu děkovná zpráva místo formuláře: „Děkujeme, poptávka je odeslaná. Brzy se vám ozveme.“
4. Kódy chyb: \`VALIDATION_ERROR\` (400, ukaž \`issues\` u polí), \`SLOT_TAKEN\` (409), \`RATE_LIMITED\` (429), \`UNAUTHORIZED\` (401 — špatný klíč, zaloguj), \`SERVER_ERROR\` (500 — „zkuste to znovu“).
5. Test: pošli jednu zkušební poptávku s \`"test": true\` (v ZakazIQ se neuloží zákazník a neukáže se v Poptávkách) a ověř, že vrátí 202. Pak napiš, ať v ZakazIQ v Nastavení › Napojený web kliknu na „Ověřit napojení“.
`
}
