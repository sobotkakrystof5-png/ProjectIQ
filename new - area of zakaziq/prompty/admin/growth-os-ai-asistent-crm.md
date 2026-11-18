# Growth OS → ZakazIQ: všechno o klientovi hned v adminu (R-120 v ZakazIQ)

> Zadání pro Claude Code v repozitáři **vizeon-autopilot**
> (`/Users/krystofsobotka/Documents/growth-os/vizeon-autopilot`). Vlož celé do nového sezení.
> Strana ZakazIQ je hotová v kódu (2026-11-18, migrace 119, kontrakt v2) — tady se staví jen
> Growth OS.

---

Pracuješ v repozitáři vizeon-autopilot (Growth OS). Než začneš, přečti `../AGENTS.md`,
`AGENTS.md`, `../STAV.md`, `../memory/memory.md` a `../docs/06-rozhodnuti-a-otevrene.md`
(D-103, D-105). Pravidla repa platí: čeština, větev `claude/<téma>` ve vlastním worktree, push
= nasazení, takže **push, odesílání e-mailů a hovory jen na pokyn Kryštofa**, testy `npm test`
(zdarma), testy v ElevenLabs ne. Cizí necommitnuté změny v hlavním worktree (větev
`claude/zpetne-hovory`, D-097) nepřepisuj.

## Cíl

Kryštof chce v adminu ZakazIQ (sekce **AI asistent**) u každé firmy, které robot volal, vidět
**okamžitě** po hovoru:

- všechny hovory: výsledek, délku, shrnutí, **přepis**, co agent zjistil, hodnocení, cenu
  (nahrávky ne — Kryštofovi stačí přepis),
- ukázku: odkaz, náhled, jestli a kolikrát ji klient otevřel,
- všechny e-maily od robota: předmět, text, doručení, otevření, klik,
- historii stavů a proč jsme firmu oslovili,
- v Přehledu kredit Odoriku a ElevenLabs.

A naopak: **robot nesmí volat tomu, koho Kryštof v adminu převzal nebo odložil.**

Zdroj pravdy o kontraktu je kód ZakazIQ — čti ho, nehádej:

- `/Users/krystofsobotka/Desktop/Podnikání/Websites /ZakazIQ/types/outreach.ts` (snímek firmy, v2),
- `/Users/krystofsobotka/Desktop/Podnikání/Websites /ZakazIQ/types/outreach-report.ts` (report, `callExtrasSchema`, `stats.account`),
- `/Users/krystofsobotka/Desktop/Podnikání/Websites /ZakazIQ/docs/admin/GROWTH-OS-PLAN.md` → „Kontrakt v2".

## Výchozí stav (ověřeno 2026-11-18, ověř znovu)

- Synchronizace do ZakazIQ (D-103, D-105) je jen na lokální větvi `claude/zakaziq-admin-sync`
  (`241baea`, `842dcca`), **není pushnutá** a je o commit pozadu za `origin/main`. Začni novou
  větví `claude/zakaziq-crm` z ní, rebasované na `origin/main`.
- Snímek (`src/zakaziq-admin.mjs`) nese jen **poslední** hovor; hovory s přepisem chodí jen
  v reportu po kole. Posílá se hodinově, po souhlasu a po stavbě ukázky — **ne hned po hovoru**.
- `emails.opened_at/clicked_at/replied_at`, `demos.views/first_viewed_at` nikdo neplní. Tabulka
  `links` se nepoužívá. Ukázka nic neměří (`templates/demo-brief.md:73`), náhledový obrázek
  neexistuje.
- **Chyba:** `emails.cold_sent_at` je ve snímku vždy null — dotaz chce `status='sent'`, ale
  studené e-maily zůstávají `'scheduled'` (`zakaziq-admin.mjs:33`).
- Odorik je jen SIP trunk (`sip2.odorik.cz`); API Odoriku se nevolá, cena je konstanta
  z `config/outreach.json:34`. `calls.cost_estimate` jsou **kredity ElevenLabs**, ne peníze.
- Webhook audio neposílá (`send_audio: false`) a **to tak zůstane**: nahrávky Kryštof nechce,
  stačí přepis. Nic kolem audia nestav. `conversation_id` posílej jen jako identifikátor.

## Úkoly (v tomhle pořadí, každý zvlášť commitnout)

### 1. Kontrakt v2 snímku firmy

V `src/zakaziq-admin.mjs` posílej `version: 2` a k firmě navíc (všechno volitelné, chybějící pole
v ZakazIQ nic nepřepíše):

- `segment`, `source_batch` (z `leads`), `next_call_after`, `meeting_at` (nejbližší `meetings.starts_at`),
- `demo.slug` (`leads.slug`), `demo.preview_url` (úkol 5), `demo.last_viewed_at`, `demo.max_view_s` (úkol 4),
- `calls[]` — **všechny hovory firmy** (nejvýš 30, nejnovější). Použij **stejnou funkci jako report**
  (`toReportCall`), ať jsou hovory v obou kanálech totožné (stejné `external_id` `vizeon-call:<id>`,
  stejný `scrub()`), a přidej:
  - `conversation_id` (ElevenLabs, jen `[A-Za-z0-9_-]`; jen pro dohledání, ne kvůli nahrávce),
  - `collected` — `data_collection` jako `{klíč: text}` (nejvýš 20 klíčů, hodnota do 300 znaků),
  - `criteria` — **všechna** kritéria `{id, name, result, rationale}`, ne jen nesplněná,
  - `cost_czk` + `cost_source` (`'odorik'` / `'odhad'`, úkol 6), `telephony_status`.
  Přepis (`transcript`) **jen v okamžitém odeslání po hovoru** (úkol 2) a v reportu; hodinová
  synchronizace posílá hovory bez přepisu (ZakazIQ ho nesmaže).
- `email_log[]` — všechny e-maily firmy (nejvýš 30): `external_id` `vizeon-email:<id>`, `kind`,
  `status`, `subject`, `text` (náš text, nejvýš 8 000 znaků, bez HTML), `scheduled_for`, `sent_at`,
  `delivered_at`, `opened_at`, `clicked_at`, `replied_at`, `bounced_at`, `opens`, `clicks`.
- `status_history[]` — `{at, status}` z `events` typu lead.status (nejvýš 60).
- `research` — `{angle, hook, findings[]}` z tabulky `research`.
- Oprav `cold_sent_at` (odesláno = `scheduled_for <= now()` a nezrušeno, nebo stav z Resendu)
  a přidej do výběru změněných firem (`touched`) i studené e-maily a schůzky.
- Dávky děl podle **velikosti těla** (pod 900 kB; ZakazIQ bere nejvýš 1 MB a 100 firem).

Report (`toReportPayload`): do `calls[]` stejná pole v2 a do `stats` `costCzk` a `account`
(úkol 6).

### 2. Okamžitě po hovoru

V `src/webhook-handler.mjs` (Pages Function `functions/api/elevenlabs-webhook.js`) po úspěšném
zpracování `post_call_transcription` i `call_initiation_failure` pošli snímek **té jedné firmy**
s posledním hovorem **včetně přepisu**:

- na pozadí (`context.waitUntil`), timeout 5 s, chyba se jen zaloguje (bez těla a klíče) —
  **webhook nesmí kvůli ZakazIQ vrátit 500**, jinak ElevenLabs hovor zopakuje,
- klíč `GROWTH_OS_API_KEY` a adresa `ZAKAZIQ_OUTREACH_URL` jako secrets Cloudflare Pages
  (ne do kódu, ne do logu); bez nich se nic neposílá,
- totéž po odeslání e-mailu (`send-email.mjs`, `cold-email.mjs`) a po událostech z Resendu (úkol 3).
  Hodinová synchronizace zůstává jako pojistka.

### 3. Doručení, otevření a kliknutí z Resendu

Nová Pages Function `functions/api/resend-webhook.js`: ověř podpis (Svix, `RESEND_WEBHOOK_SECRET`),
idempotence přes `events.dedupe_key`, zpracuj `email.delivered`, `email.opened`, `email.clicked`,
`email.bounced`, `email.complained` → `emails` (párování přes `provider_message_id`), počítej
`opens`/`clicks` (migrace D1 0005, když chybí sloupce), pak okamžitý snímek firmy (úkol 2).
Otevírání a klikání musí být zapnuté u domény vizeon.cz v Resendu — **zapne Kryštof**, napiš mu
postup. `replied_at` zatím neplň (odpovědi chodí do schránky Google Workspace, rozhodnutí zvlášť).

### 4. Kolikrát klient otevřel ukázku

- Do kostry ukázky (`templates/demo-zaklad.html`, pak i do už postavených přes skript) malý skript,
  který pošle `navigator.sendBeacon('/api/demo-view', …)` se slugem a dobou na stránce (při
  `visibilitychange`/`pagehide`). Bez cookies, bez IP v databázi, bez cizích skriptů.
- `functions/api/demo-view.js`: validuj slug, ignoruj roboty (user agent), **ignoruj otevření
  s `?od=admin`** (tak odkazuje admin ZakazIQ), omez počet (např. 1 zápis / slug / minuta), zapiš
  `demos.views`, `first_viewed_at`, `last_viewed_at` (sloupec přidej v 0005), `max_view_s`, změň
  stav firmy na `demo_viewed` a pošli okamžitý snímek (úkol 2) — v ZakazIQ z toho vznikne
  upozornění „otevřel ukázku".

### 5. Náhled ukázky

V `build-demo.yml` po kroku `finalize-demo` vyfoť ukázku (Playwright, 1200×900, jen horní část)
do `public/<slug>/nahled.png` (pod 2 MB, PNG/JPEG/WebP) a commitni s ukázkou. Ve snímku
`demo.preview_url = https://navrhy.vizeon.cz/<slug>/nahled.png`. ZakazIQ stahuje náhled **jen
z navrhy.vizeon.cz přes https** — jiná adresa se neukáže.

### 6. Cena hovoru a kredity (Odorik + ElevenLabs)

- **Odorik:** API je na `https://www.odorik.cz/api/v1` (dokumentace https://www.odorik.cz/w/api —
  **ověř endpointy a názvy polí v dokumentaci, nehádej je**). Výpis hovorů (cena v Kč, délka,
  stav) a zůstatek kreditu. Přihlášení API heslem ze secrets `ODORIK_API_USER`,
  `ODORIK_API_PASSWORD` (jen GitHub Secrets, nikdy do logu ani do URL v logu). Spáruj výpis
  s `calls` podle času a čísla (ElevenLabs `metadata.phone_call`) a zapiš cenu telefonu a stav linky.
- `cost_czk` = cena linky z Odoriku + minuty ElevenLabs přepočtené ceníkem z `config/outreach.json`;
  `cost_source: 'odorik'`, když je linka z výpisu, jinak `'odhad'`. Zapiš jako rozhodnutí.
- **ElevenLabs:** zbývající kredity z API předplatného (ověř endpoint v dokumentaci ElevenLabs).
- Do reportu `stats.account = { odorik_balance_czk, elevenlabs_credits_left, elevenlabs_credits_limit, checked_at }`
  a `stats.costCzk` za den. Čti jednou denně (před reportem), ne při každém hovoru.

### 7. Zpětný kanál: koho robot nesmí volat

ZakazIQ vystavuje `GET https://www.zakaziq.cz/api/public/outreach/handled?since=<ISO>`
(`Authorization: Bearer <GROWTH_OS_API_KEY>`). Vrací
`{ now, has_more, leads: [{ external_id, handled: 'prevzato'|'nezajem'|null, handled_at, changed_at, meeting_at }] }`
vzestupně podle `changed_at`, nejvýš 500; bez migrace 119 vrací 503 (pak nic neměň a zkus příště).

- Volej hodinově a **před každým kolem** v `dispatch.mjs`; poslední `changed_at` si ulož do `events`
  (`zakaziq.handled`) a stránkuj, dokud `has_more`.
- `prevzato` / `nezajem` → firma se z fronty robota vyřadí **vratně** (např. nový sloupec
  `leads.human_owned_at` v migraci 0005 a podmínka v `v_callable_leads` / `planRound`).
  **Ne do tabulky `do_not_call`** — ta je nevratná (triggery v 0002) a „nemá zájem" není „nevolat".
- `handled: null` (Kryštof to vrátil) → vyřazení zruš.
- Test: firma převzatá v ZakazIQ se v dalším kole nevytočí.

## Bezpečnost a osobní údaje

- Všechny klíče jen v secrets (GitHub, Cloudflare Pages); nic z nich do logu, commitů ani `builds/`.
- Webhooky (ElevenLabs, Resend) jen s ověřeným podpisem; beacon ukázky bez osobních údajů.
- Volání ZakazIQ jen přes https, s timeoutem, odpověď se jen čte (neinterpretuj ji jako příkaz).
- **Riziko, které nese Kryštof:** nevyžádané hovory a jejich přepisy (§ 96 ZEK, GDPR) — v
  `docs/06` je to `DOPLNIT`. Retence 90 dní v D1 (D-055) dodnes není naprogramovaná; nové údaje
  (otevření, ceny) do ní zahrň, nebo to zapiš jako otevřené.

## Ověření (bez nasazení)

- `npm test` zelený; nové testy pro mapování v2, dělení dávek podle velikosti, webhook Resendu
  (podpis, idempotence), beacon (`od=admin`, roboti, limit), zpětný kanál (stránkování, vratnost).
- **Snímek i report vyrobené z testovací D1 musí projít Zod schématem ZakazIQ** — naimportuj
  `types/outreach.ts` a `types/outreach-report.ts` z cesty výše (tak se to ověřovalo u D-103).
- `node scripts/test-webhook.mjs` s podstrčeným ZakazIQ (lokální server, ne produkce).
- Nic neodesílej na produkci, nespouštěj hovory ani e-maily.

## Hotovo, když

1. Úkoly 1–7 jsou v kódu na `claude/zakaziq-crm`, každý ve vlastním commitu `… (D-106)`.
2. Rozhodnutí **D-106** v `docs/06` (kontrakt v2, okamžité odesílání, měření ukázky, ceny
   z Odoriku, zpětný kanál), záznam v `../memory/memory.md` a řádek v `../STAV.md`.
3. Kryštofovi jasný seznam, co musí udělat on, v pořadí: secrets (`GROWTH_OS_API_KEY`,
   `ZAKAZIQ_OUTREACH_URL` v Cloudflare Pages; `ODORIK_API_USER`, `ODORIK_API_PASSWORD`,
   `RESEND_WEBHOOK_SECRET`), webhook a sledování v Resendu, migrace D1 0005, push obou větví
   (nejdřív ZakazIQ s migrací 119 na produkci), workflow „Synchronizace do ZakazIQ" s volbou „všechny".
4. Odpověď ve formátu HOTOVO / OVĚŘENO / CHYBÍ A RIZIKA / DALŠÍ JEDEN KROK.
