# ZakazIQ — veřejné API pro poptávky (v1)

Jak poslat poptávku z webu klienta do ZakazIQ. Z tohohle dokumentu čerpá skill `zakaziq-napojeni` a prompt „Zkopírovat prompt pro Claude Code“ v aplikaci (`lib/ws/intake/claude-prompt.ts`). Kód: `lib/ws/intake/`, `app/api/public/v1/`.

Adresa: `https://zakaziq.cz` (dál jen `API`). Všechno je JSON v UTF-8.

## Tři cesty

| Cesta | Pro koho | Klíč | Kde ho najdete |
|---|---|---|---|
| **Server webu** (hlavní) | weby postavené v Claude Code, e-shopy | tajný `sk_live_…` v hlavičce `Authorization: Bearer` | Nastavení › Napojený web › Tajný klíč (ukáže se jen jednou) |
| **Widget** | cizí weby (WordPress, Wix, Shoptet) | veřejný `pk_live_…` v `?key=` + povolená doména | `<script src="API/embed/<slug>.js" async></script>` |
| **Objednávací stránka** | bez webu, Instagram, QR kód | žádný | `API/r/<slug>` |

Tajný klíč patří **jen na server**. Požadavek s tajným klíčem a hlavičkou `Origin` (tedy z prohlížeče) API odmítne. Veřejný klíč projde jen z domény zapsané v Nastavení › Napojený web › Povolené weby (přesná adresa `https://…`, bez cesty).

## `GET /api/public/v1/schema`

Služby, vlastní kolonky a nabídka času byznysu. Odpověď se smí cachovat 60 s.

Parametry: `serviceId` (nepovinné) — volné časy pro tuhle službu (jinak pro první); `staffId` (nepovinné) — časy konkrétního pracovníka. V `booking.staff` dostanete seznam pracovníků, kteří službu nabízejí.

```bash
curl https://zakaziq.cz/api/public/v1/schema \
  -H "Authorization: Bearer $ZAKAZIQ_KEY"
```

```json
{
  "success": true,
  "version": 1,
  "business": { "name": "Kadeřnictví Lenka", "slug": "kadernictvi-lenka", "color": "#23478b" },
  "services": [{ "id": "7e2d…", "name": "Dámský střih", "durationMin": 60, "price": 650, "currency": "CZK" }],
  "fields": [{ "key": "delka_vlasu", "label": "Délka vlasů", "type": "choice", "required": false, "options": ["Krátké", "Střední", "Dlouhé"] }],
  "booking": { "mode": "slots", "stepMin": 30, "slots": [{ "date": "2026-10-12", "label": "po 12. 10.", "times": [{ "time": "9:00", "start": "2026-10-12T07:00:00.000Z" }] }], "staff": [{ "id": "6a32…", "name": "Jana" }, { "id": "7e2d…", "name": "Lenka" }] },
  "contact": { "name": "required", "phoneOrEmail": "required" }
}
```

`booking.mode`:

| Režim | Kdy | Co poslat |
|---|---|---|
| `slots` | byznys má kalendář a otevírací dobu | `start` z `booking.slots[].times[].start`; volné časy na 3 týdny dopředu, nejdřív hodinu od teď |
| `free` | kalendář bez otevírací doby | zákazník navrhne čas sám: `date` (RRRR-MM-DD) + `time` (HH:MM), pražský čas, do 60 dní, 7:00–20:00 po 30 min |
| `none` | bez kalendáře | žádný čas (datum může být vlastní kolonka) |

Typy kolonek: `text`, `address` (řádek textu), `number`, `date` (RRRR-MM-DD), `choice` (pilulky) a `select` (seznam) — u obou jen hodnota z `options`.

## `POST /api/public/v1/requests`

```json
{
  "name": "Tereza Nováková",
  "phone": "+420 777 123 456",
  "email": "tereza@example.cz",
  "serviceId": "7e2d…",
  "start": "2026-10-12T09:00:00+02:00",
  "message": "Dobrý den, …",
  "fields": { "delka_vlasu": "Dlouhé" },
  "externalId": "objednavka-1042",
  "website": ""
}
```

| Pole | | |
|---|---|---|
| `name` | povinné | 2–120 znaků |
| `phone`, `email` | aspoň jedno | telefon se uloží jako +420…, e-mail malými písmeny; podle nich se najde existující zákazník |
| `serviceId` | nepovinné | jen služba z `schema` |
| `staffId` | nepovinné | ID pracovníka z `booking.staff`; jen v režimu `slots`, dostupnost se znovu zkontroluje při uložení. Bez něj se čas nabídne podle všech pracovníků služby. |
| `start` nebo `date` + `time` | podle `booking.mode` | ISO 8601 s časovým pásmem, nebo pražský den a čas; jen budoucnost |
| `message` | nepovinné | do 2000 znaků |
| `fields` | podle kolonek | klíče, které byznys nezná, se zahodí |
| `externalId` | nepovinné | číslo objednávky e-shopu; stejné číslo podruhé = žádná nová poptávka (`200`, `duplicate: true`) |
| `source` | nepovinné | `web` (výchozí) nebo `eshop`, jen s tajným klíčem |
| `test` | nepovinné | `true` = zkušební poptávka: uloží se, ale nezaloží zákazníka a neukáže se v Poptávkách ani v Dnes |
| `marketingConsent` | nepovinné | `true` = zákazník zaškrtl, že chce dostávat nabídky (souhlas se uloží u zákazníka, S18). Políčko musí být nezaškrtnuté předem; `false` nebo chybějící souhlas neodvolá |
| `website` | past na roboty | posílejte z neviditelné kolonky; vyplněná = robot, API odpoví úspěchem a nic neuloží |

Hlavička `Idempotency-Key` (nepovinná, 1–200 znaků bez mezer, doporučeno nové UUID na jedno odeslání formuláře): opakovaný požadavek se stejným klíčem do 24 h vrátí stejnou odpověď s hlavičkou `Idempotent-Replayed: true`, nic nového se neuloží. Stejný klíč s jiným tělem = `422`.

Limit těla 64 kB.

### Odpověď

Úspěch `202`:

```json
{ "success": true, "id": "ac14…" }
```

Když firmě neběží předplatné, poptávka se uloží stejně a přijde navíc upozornění — formulář má zákazníkovi poděkovat jako obvykle:

```json
{ "success": true, "id": "ac14…", "notice": { "code": "SUBSCRIPTION_INACTIVE", "message": "Poptávka je uložená. …" } }
```

Chyba — `error` a `issues[].message` jsou česky a dají se ukázat přímo u formuláře:

```json
{ "success": false, "code": "VALIDATION_ERROR", "error": "Kontakt: vyplňte prosím telefon nebo e-mail.", "issues": [{ "field": "phone", "message": "Kontakt: vyplňte prosím telefon nebo e-mail." }] }
```

| Kód | HTTP | Co dělat |
|---|---|---|
| `VALIDATION_ERROR` | 400 | ukázat `issues` u polí (`fields.<klíč>` = vlastní kolonka) |
| `INVALID_BODY` | 400 / 413 | tělo není JSON, je moc velké nebo má špatnou hlavičku `Idempotency-Key` |
| `UNAUTHORIZED` | 401 | špatný nebo chybějící klíč, tajný klíč z prohlížeče — zalogovat, zákazníkovi obecná hláška |
| `FORBIDDEN_ORIGIN` | 403 | widget z domény, která není povolená |
| `SLOT_TAKEN` | 409 | čas mezitím někdo vzal — načíst `GET /schema` znovu se stejnými `serviceId` a případně `staffId` |
| `IN_PROGRESS` | 409 | stejný `Idempotency-Key` se právě zpracovává — zkusit za chvíli |
| `IDEMPOTENCY_MISMATCH` | 422 | stejný klíč, jiné tělo — poslat nový klíč |
| `RATE_LIMITED` | 429 | moc požadavků (20/min z jedné IP, 300/h na firmu), hlavička `Retry-After` |
| `NOT_CONFIGURED` | 503 | výpadek na naší straně |
| `SERVER_ERROR` | 500 | zkusit znovu (se stejným `Idempotency-Key`) |

## Příklad: Next.js server action

`.env.example`: `ZAKAZIQ_KEY=` (hodnota jen ve Vercelu, nikdy v kódu ani v `NEXT_PUBLIC_…`).

```ts
'use server'

import { randomUUID } from 'crypto'
import { z } from 'zod'

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  website: z.string().max(500).optional(),
})

export async function sendRequest(_: unknown, form: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: 'Zkontrolujte prosím formulář.' }
  const key = process.env.ZAKAZIQ_KEY
  if (!key) {
    console.error('ZAKAZIQ_KEY chybí')
    return { ok: false, error: 'Odeslání teď nejde. Zavolejte nám prosím.' }
  }
  const res = await fetch('https://zakaziq.cz/api/public/v1/requests', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': String(form.get('idempotencyKey') || randomUUID()),
    },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (body?.success) return { ok: true }
  if (res.status === 401) console.error('ZakazIQ odmítl klíč')
  return { ok: false, error: body?.error ?? 'Poptávku se nepodařilo odeslat. Zkuste to prosím znovu.', issues: body?.issues }
}
```

## Příklad: curl

```bash
# zkušební poptávka (neuloží zákazníka, v aplikaci jen v záznamu Napojený web)
curl -X POST https://zakaziq.cz/api/public/v1/requests \
  -H "Authorization: Bearer $ZAKAZIQ_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"Zkouška napojení","email":"zkouska@example.cz","test":true}'
```

## Widget

```html
<script src="https://zakaziq.cz/embed/kadernictvi-lenka.js" async></script>
<!-- objednávkový formulář přímo ve stránce -->
<script src="https://zakaziq.cz/embed/kadernictvi-lenka.js" data-mode="inline" async></script>
<!-- vlastní text tlačítka -->
<script src="https://zakaziq.cz/embed/kadernictvi-lenka.js" data-label="Rezervovat termín" async></script>
```

Skript (bez knihoven) vloží tentýž objednávkový formulář jako `/r` do izolovaného iframe; styly webu ho nerozbijí a ve widgetu se neopakuje vlastní formulář ani API klíč. Když web používá vlastní CSP, potřebuje `script-src https://zakaziq.cz`, `style-src https://zakaziq.cz` a `frame-src https://zakaziq.cz`. Objednávka v iframe je omezena sandboxem a stránka `/r` ji dovolí zobrazit jen na doménách povolených v Nastavení › Napojený web.

## Objednávací stránka ve vlastním rámu

`<iframe src="https://zakaziq.cz/r/<slug>">` funguje jen na povolených webech (`frame-ancestors`). Jinak stačí odkaz nebo QR kód z Nastavení › Napojený web.
