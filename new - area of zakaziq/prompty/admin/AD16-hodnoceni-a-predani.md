# AD16 — Hodnocení, reference a předávací dokument

## Cíl
Dotazník odejde sám, když zakázku uzavřeš. Z odpovědí se dá jedním klikem udělat reference na web.
Klient dostane dokument, co bylo dodané. A AI leady konečně někdo uvidí.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/admin/MODERNIZACE-ADMIN-PLAN.md` → AD16.
Platí **R-090**. Navazuje na AD11 (zakázka je jediná pravda) a AD12 (PDF a `lib/invoice-pdf/`).
Texty pro klienty **vždy** přes `zakaziq-ux-texty-cs`, marketingové přes `humanize-text-cs`.

## Co je dnes špatně
- Dotazník se pošle **jen jednou**, v okamžiku ručního „Přidat do dokončených"
  (`app/actions.ts:501–513`). Zakázka může být zaplacená a klient dotazník nikdy nedostane.
- Když klient nereaguje, Kryštof **ručně kopíruje odkaz** — v `components/HodnoceniDashboard.tsx:230–246`
  je to doslova napsané („můžeš ho zkopírovat a poslat znovu").
- `agent_leads` (AI scorované leady z `vizeon-lead-agent`, migrace 052) se **ukládají a nikdo je
  nevidí** — grep najde jediný výskyt, INSERT v `app/api/public/agent-leads/route.ts:51`.
  Tabulka přitom má `lead_score`, `priority`, `summary` i `communication_strategy`.

## Kroky

### 1. Migrace 112
(110 zabral AD14, 111 AD15 — viz R-100.) `migrations/112_hodnoceni_automaticky.sql`: `project_surveys.requested_at`, `reminded_at`
(nebo tytéž sloupce na zakázce, podle toho, kde po AD11 dotazník visí — rozhodni a zdůvodni).

### 2. Dotazník automaticky
- Uzavření zakázky (`done` / `paid`) zařadí dotazník k odeslání přes `after()` s odkladem,
  takže „Zpět" ho zruší. Jen pro `project_type = 'client'` a jen když má klient e-mail.
- **Jedna připomínka** po sedmi dnech, když klient nevyplnil. Pak už nic.
  Pošle ji denní cron `send-reminders` spolu s ostatními — **nový cron nestav**.
- Odesláno/připomenuto je vidět u zakázky, ať Kryštof pozná, co se stalo.

### 3. Reference pro web
Z hodnocení **se souhlasem** (`project_surveys` už souhlas sbírá) jedním klikem vzít úryvek pro
vizeon.cz: jméno, firma, hvězdičky, text. **Výstup je text ke zkopírování, ne automatická publikace** —
na web to pořád vkládá člověk. Nevymýšlej čísla ani formulace, které klient nenapsal.

### 4. Předávací dokument
„Co bylo dodané": stránky, funkce, přístupy, co je v ceně údržby a co ne. Skládá se z položek
zakázky, generuje se do PDF **stejnou cestou jako faktura** (`lib/invoice-pdf/` z AD12 — žádná
nová závislost, `puppeteer-core` a `@sparticuz/chromium` už v projektu jsou) a dá se poslat
s fakturou. Zároveň je to krok „Předáno" v průvodce z AD11.
**Do `next.config.mjs`** přidej cestu nové PDF routy k `outputFileTracingIncludes` pro Chromium,
jinak to spadne až na produkci.

### 5. AI leady zviditelnit
`agent_leads` do Hovorů jako samostatný pruh seřazený podle `lead_score`, s prioritou a shrnutím.
`summary` a `communication_strategy` jsou **text z AI o skutečném člověku** — nikdy je nevykresluj
jako HTML a neposílej klientovi. Z AI leadu musí jít udělat zakázku nebo lead stejnou cestou
jako z ostatních.

## Hotovo, když
- Uzavření zkušební zakázky pošle dotazník; po sedmi dnech odejde **právě jedna** připomínka
  (ověřeno posunutým časem v testu, ne čekáním).
- Reference se zkopíruje i s hvězdičkami; bez souhlasu klienta se nenabídne.
- Předávací dokument se vygeneruje do PDF a otevře se (ověř **okem**, ne jen stavovým kódem).
- `agent_leads` jsou v Hovorech vidět a dá se z nich založit zakázka.
- `npm test`, `tsc`, build zelené.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD16 v plánu, changelog (migrace 112, „aplikována: ne").
Commit `admin/hodnoceni: dotazník automaticky, reference, předávací dokument`.
