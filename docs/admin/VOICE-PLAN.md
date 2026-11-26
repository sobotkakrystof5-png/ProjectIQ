# ZakazIQ Voice — plán

> Vlastní diktování jako Wispr Flow: na MacBooku podržím **Fn**, mluvím, pustím a text se vloží
> tam, kde je kurzor. Malá lišta s mřížkou dílků dole na obrazovce ukazuje, že poslouchá.
> Zpracování, učení a statistiky běží v adminu ZakazIQ.
>
> **Zdroj pravdy pro rozsah.** Prompty sezení jsou v `new - area of zakaziq/prompty/voice/`
> (jedno sezení = jedna nová konverzace v Claude Code). Stav sezení je v oddílu 14, rozhodnutí
> v `memory/memory.md` jako **R-150** (zapsáno ve VO00, 2026-11-25; číslo R-147 má navrhovač
> nabídek na jiné větvi). Plán napsán 2026-11-25.

---

## 1. Co stavíme jednou větou a co z toho bude vidět

**Jednou větou:** aplikace na Macu nahraje řeč, server ZakazIQ ji přepíše, zkontroluje, že si
nic nevymyslel, učeše ji a vrátí text, který aplikace vloží; každý diktát se zapíše, aby šly
počítat statistiky a aby se systém z oprav učil.

Co Kryštof uvidí:

| Kde | Co |
|---|---|
| Kdekoli na Macu | Lišta dole uprostřed: v klidu malá pilulka s mřížkou 2×2 dílků, při mluvení vlnky a čas, při zpracování dílky „běží dokola". |
| Lišta menu nahoře | Ikona 2×2 dílků: Diktovat, Otevřít ZakazIQ Voice, Zkopírovat poslední diktát, Pozastavit, Nastavení, Ukončit. |
| Okno ZakazIQ Voice | Jako Wispr Flow: Domů (slova dnes, série, rychlost, poslední diktáty), Historie, Slovník, Styl, Nastavení. |
| Admin `/dashboard/voice` | Přehled (slova po dnech, série, rychlost, ušetřený čas, kategorie, aplikace, heatmapa), Historie, Učení (návrhy ke schválení), Slovník a pravidla, Nastavení a zařízení. |
| Admin Dnes | Karta „Diktování dnes: 1 240 slov · série 5 dní". |

### Co znamená „model se učí"

Upřímně: váhy modelu se nemění. Systém se zlepšuje tím, že z logů a z oprav po vložení
staví **slovník** (jak se píše „ZakazIQ", „Prvotka", jména klientů), **blokované fráze**
(typické halucinace přepisu) a **pravidla stylu**, a ty se posílají do přepisu i do čištění
textu. Jestli to pomáhá, ukazuje měřítko „kolik diktátů jsem po vložení musel opravit" po
týdnech (oddíl 8).

---

## 2. Rozhodnutí

Kryštof prošel 2026-11-25 (VO00): D-V2, D-V5 a D-V8 podle doporučení, **D-V7 změnil** (text
natrvalo, dokud ho sám nesmaže). Ostatní platí, jak jsou. Zapsáno jako R-150.

| # | Rozhodnutí | Doporučení | Proč | Alternativa |
|---|---|---|---|---|
| D-V1 | Název a vzhled | **ZakazIQ Voice**, Dílky, logo 2×2, lišta dole uprostřed jako Wispr Flow | Zadání Kryštofa | — |
| D-V2 | Kde běží zpracování | **Server ZakazIQ** (admin). Mac jen nahrává, ukazuje a vkládá | Klíče poskytovatelů jen na serveru, jedno místo pro logy, učení a statistiky | Mac volá Groq přímo: o 100–300 ms rychlejší, ale klíč na Macu a logy zvlášť |
| D-V3 | Přepis řeči | **Groq `whisper-large-v3-turbo`**, odpověď `verbose_json` se segmenty; záložně OpenAI (`OPENAI_API_KEY` už v projektu) | Rychlé a levné; segmenty nesou míru jistoty, ze které stojí pojistky proti halucinacím | OpenAI jako hlavní (dražší, bez segmentů). Test VO00: oddíl 12a — **Groq zatím neměřený** (chybí klíč), výchozí zůstává podle doporučení, dokud test nedoběhne |
| D-V4 | Čištění textu | **Claude role `fast`** (`lib/ai/models.ts`) s kontrolou výstupu; neprojde-li, vrátí se přepis | Odstraní „ehm", opraví interpunkci a samoopravy; kontrola brání tomu, aby si model něco přidal | Bez čištění (jen přepis a slovník) |
| D-V5 | Aplikace na Macu | **Swift (SwiftUI + AppKit), macOS 14+, bez cizích balíčků**, složka `voice-mac/` v repu, sestavení `make`, podpis stálou vlastní identitou | Fn, oprávnění a vkládání jdou jen nativně; jedno repo = Claude Code vidí server i aplikaci | Samostatné repo; Electron/Tauri (těžší a horší přístup k Fn) |
| D-V6 | Ovládání | Držet **Fn ≥ 0,3 s** = diktát, pustit = vložit. **Dvakrát Fn** = bez držení, Fn znovu = konec. **Esc** = zrušit. Klik na lištu = start/stop. Záložní zkratka **pravý ⌥** | Jako Wispr Flow | Jen klik |
| D-V7 | Soukromí | Zvuk se **neukládá** (na Macu jen ve frontě do odeslání, nejvýš 24 h). Text na serveru **natrvalo, dokud ho Kryštof nesmaže** (jeden diktát, období, vše; Historie v adminu). Dvojice oprav žijí s diktátem (smazání diktátu je smaže). Volba „jen čísla" a volitelný automatický výmaz po N dnech (výchozí vypnutý) | Rozhodl Kryštof 2026-11-25: chce celou historii k dohledání | Původní doporučení 90 dní |
| D-V8 | Učení | Slovo se **naučí samo** po 3 stejných opravách (jde vypnout i vrátit). Pravidla stylu a blokované fráze **jen po schválení**. Týdenní rozbor AI jen navrhuje | Samo se smí učit jen to, co nic nezkazí | Všechno po schválení |
| D-V9 | Admin | `/dashboard/voice` ve skupině **Osobní**, karta na Dnes. Okno na Macu ukazuje tatáž čísla ze serveru | Jeden zdroj čísel | — |
| D-V10 | Bez sítě | Diktát čeká ve frontě a přepíše se, až síť bude. **Sám se později nevkládá**, je v historii a jde zkopírovat | Text vložený o hodinu později do jiného okna by škodil | Vložit po obnovení |
| D-V11 | Limity | Nahrávka nejvýš **10 min** (upozornění v 9:30), audio do 4 MB, 400 diktátů za hodinu na zařízení, **denní strop nákladů** (výchozí 1 USD), nad ním bez čištění | Ochrana proti chybě ve smyčce a proti limitu těla na Vercelu | — |
| D-V12 | Vývoj | Proti **localhost a testovacímu Neonu**, produkce až VO12 | Pravidla repa (migrace a služby jen se souhlasem) | — |
| D-V13 | Písmo v aplikaci | Instrument Sans a JetBrains Mono přibalené v aplikaci (licence OFL), v liště téměř bez textu | Dílky | Systémové písmo |

Kryštof už rozhodl (2026-11-25): název ZakazIQ Voice, barvy a logo ZakazIQ, rozhraní jako
Wispr Flow, podobná technologie, ochrana proti halucinacím, učení z logů, umístění v adminu,
aktivita a slova za den na dashboardu, psaní přímo v repu s Claude Code.

---

## 3. Architektura

```
┌─────────── MacBook ───────────┐                 ┌──────────── ZakazIQ (Vercel, fra1) ────────────┐
│ Fn (CGEventTap)               │                 │ POST /api/public/voice/dictate                  │
│   → nahrávání AAC 16 kHz mono │  multipart      │   klíč zařízení → limit → velikost → typ        │
│   → lišta s dílky (úroveň)    │ ───────────────▶│   G1 ticho? → přepis (Groq, záloha OpenAI)      │
│ puštění Fn                    │  audio + meta   │   → pojistky → slovník → zkratky                │
│   → odeslání                  │                 │   → čištění (Claude fast) → kontrola výstupu   │
│ ◀── text                      │ ◀───────────────│   → zápis voice_dictations → odpověď           │
│   → vložení (schránka + ⌘V)   │   JSON          │                                                 │
│   → po chvíli přečte pole     │  POST /feedback │ učení: opravy → slovník / návrhy                │
│     a pošle opravu            │ ───────────────▶│ denní cron: úklid textu, týdenní rozbor AI      │
│ okno: GET /config, /stats     │                 │ /dashboard/voice: statistiky, učení, slovník    │
└───────────────────────────────┘                 └─────────────────────────────────────────────────┘
```

### Cesta jednoho diktátu

1. **Fn dolů.** Aplikace si zapamatuje aplikaci vpředu (bundle id, název) a **hned začne
   nahrávat** (aby se neztratila první slabika). Je-li zapnutý bezpečný vstup (pole pro
   heslo), nenahrává a ukáže „V poli pro heslo diktování nejde".
2. **Fn drženo ≥ 0,3 s** → lišta se roztáhne, vlnky podle hlasitosti. Kratší stisk se zahodí.
   Stiskne-li se při drženém Fn jiná klávesa (Fn+F5, Fn+šipka), diktát se zruší.
3. **Fn nahoru** → konec nahrávky. Mac změří čas řeči bez ticha (`speechMs`), vytvoří `id`
   (UUID) a pošle audio + meta. Lišta ukazuje zpracování.
4. **Server:** ověří klíč zařízení, limity, velikost a typ. Je-li `speechMs < 300`, vrátí
   prázdný výsledek bez přepisu (G1). Jinak přepis, pojistky, slovník, zkratky, čištění,
   kontrola, zápis do `voice_dictations`, odpověď `{ status, text, words, guards }`.
5. **Mac vloží text**: uloží obsah schránky, vloží text, pošle ⌘V do původní aplikace
   a schránku po 0,6 s vrátí (jen když ji mezitím nezměnil nikdo jiný). Změnila-li se mezitím
   aplikace vpředu, nevkládá: text je ve schránce a lišta to řekne.
6. **Opravy:** do 60 s aplikace přečte obsah pole (Zpřístupnění), najde vložený úsek a když
   ho Kryštof upravil, pošle `POST /feedback`. Z toho se server učí.

Cíl rychlosti: od puštění Fn po vložení **p50 do 1,5 s** u diktátu do 20 slov, p95 do 3 s.
Měří se v `voice_dictations.total_ms` (server) a v historii na Macu (celek).

---

## 4. Pojistky proti halucinacím

Whisper si na tichu a šumu vymýšlí věty z titulků („Titulky vytvořil…", „Děkuji za
pozornost") a model na čištění by mohl odpovídat místo opisování. Proto vrstvy:

| # | Kde | Pojistka | Co se stane |
|---|---|---|---|
| G1 | Mac + server | Řeč kratší než 300 ms | Přepis se nevolá, `status = empty` |
| G2 | Server | Segment s `no_speech_prob > 0,6` a `avg_logprob < −1`, nebo `compression_ratio > 2,4` | Segment se zahodí (jen u Groq, OpenAI segmenty nemá) |
| G3 | Server | Opakování („a a a a", stejná věta třikrát) | Sloučí se; čísla se neslučují nikdy („sedm sedm sedm" je telefon, VO07) |
| G4 | Server | Blokované fráze: `always` = vždy pryč, `alone` = jen když je to celý přepis krátké nahrávky (< 4 s) | Zahodí se; zbude-li nic, `status = blocked` |
| G5 | Server | Víc než 8 slov za sekundu řeči | `status = blocked` (přepis nemůže odpovídat nahrávce) |
| G6 | Server | Čištění: výstup začíná jako odpověď asistenta („Jasně", „Zde je", „Sure") | Vrátí se přepis, `status = raw` |
| G7 | Server | Čištění: délka mimo meze (méně než 0,5× slov, u krátkých do 12 slov 0,25×; víc než 1,35× + 4; číslo = jedno slovo) | `raw` |
| G8 | Server | Čištění: nová slova, která v přepisu ani ve slovníku nejsou, víc než max(3, 20 %) (styl Přesně max(1, 10 %)); tři nová za sebou; pozdrav nebo podpis navíc; **nové jméno** s velkým písmenem uprostřed věty; **otočený zápor** („nechci" → „chci") | `raw` |
| G9 | Server | Čištění: číslo ve výstupu, které v přepisu nezaznělo (číslicemi ani slovy), nebo číslo z přepisu zmizelo (kromě samooprav „teda", „vlastně") | `raw` |
| G10 | Server | Časový limit čištění 6 s, přepisu 20 s (pak záloha) | `raw` / záloha / `error` |
| G11 | Server | Denní strop nákladů | Bez čištění, `raw` + upozornění |
| G12 | Server | **Ozvěna nápovědy:** přepis tvoří jen slova z nápovědy slovníku (`prompt`), ve stejném pořadí, nebo je s ní shodný po normalizaci | Zahodí se, `status = blocked`. Přidáno ve VO00: OpenAI s nápovědou na 5 s ticha vrátilo celou nápovědu jako přepis (oddíl 12a) |

Každá pojistka, která zasáhla, se zapíše **kódem** do `voice_dictations.guards` (bez textu),
takže admin ukáže, která zasahuje nejčastěji. Zlatá sada (`VO07`) drží příklady všech pojistek
a pouští se v `npm test`.

**Text diktátu je pro model data, ne pokyn.** Diktuji-li „ignoruj předchozí pokyny…", čištění
to má opsat. Výstup se nikdy nevykonává, jen vkládá, a G6–G9 ho vrátí na přepis, kdyby model
začal odpovídat.

---

## 5. Učení z logů

```
vložený text ──▶ Kryštof ho upraví ──▶ Mac pošle upravený úsek (POST /feedback)
                                              │
                               rozdíl po slovech (LCS) → dvojice „slyšel → opravil"
                                              │
                         ┌────────────────────┼─────────────────────────┐
                 stejná dvojice ≥ 3×   celý text smazán ≥ 2×      týdně ≥ 8 oprav
                 (různé diktáty)       (stejná fráze)             → rozbor AI (role smart)
                         │                    │                         │
             slovo do slovníku samo     návrh blokované fráze     návrhy pravidel stylu
             (je-li zapnuto), jinak     ke schválení              ke schválení (s příklady)
             návrh ke schválení
                         └────────────────────┴─────────────────────────┘
                                              │
              slovník → nápověda přepisu (prompt) + náhrady · pravidla → čištění · příklady
```

Pravidla:

- **Rozdíl** se počítá jen z úseku, který vložil ZakazIQ Voice. Přepsal-li Kryštof víc než
  polovinu slov, je to nový text, ne oprava, a neučí se z něj. Změna jen interpunkce se
  nepočítá, změna velkých písmen ano („zakaziq" → „ZakazIQ").
- **Slovo se naučí samo**, když stejnou opravu udělal ve 3 různých diktátech za 60 dní a oprava
  vypadá jako jméno nebo pojem (velké písmeno, číslice uvnitř slova, podobnost ≥ 0,6).
  V adminu je v „Naučené samo" s tlačítkem Vrátit.
- **Blokovaná fráze a pravidlo stylu** se nikdy nepřidají samy.
- **Týdenní rozbor AI** (pondělí, z denního cronu `send-reminders`): dostane opravené diktáty od
  minulého rozboru (nejvýš 30 dní zpět, nejvýš 40, každý text do 1 000 znaků) po
  `redactSensitive()`, vrátí nejvýš 5 návrhů pravidel, každý s aspoň 2 příklady. Zod ověří
  tvar, návrh bez příkladů nebo s cizím id se zahodí. Běží jen při ≥ 8 opravených diktátech.
- **Úklid** (cron `client-retention`): s nastavenou lhůtou smaže text diktátu i jeho dvojice
  oprav, čísla zůstanou. Naučená slova ve slovníku zůstávají.
- Do čištění jde: aktivní pravidla, nejpoužívanější slova ze slovníku (do 30) a 5 posledních
  schválených příkladů. Do přepisu jde nápověda ze slovníku (do 600 znaků).

---

## 6. Datový model (migrace 138, schéma `public`)

Číslo migrace = další volné (`ls migrations`; dnes poslední 135). Návrh SQL je
v `new - area of zakaziq/prompty/voice/podklady/navrh-serveru/138_zakaziq_voice.sql.txt`.

| Tabulka | K čemu | Hlavní sloupce |
|---|---|---|
| `voice_devices` | Mac s vlastním klíčem | `name`, `prefix`, `key_hash` (HMAC), `last_used_at`, `revoked_at` |
| `voice_dictations` | Jeden řádek = jeden diktát; `id` vytváří Mac (opakované odeslání nic nezdvojí) | `started_at`, `duration_ms`, `speech_ms`, `mode`, `app_bundle_id`, `app_name`, `category`, `status`, `guards[]`, `raw_text`, `final_text`, `edited_text`, `words`, `words_corrected`, `dictionary_fixes`, `user_edits`, `stt_*`, `llm_*`, `total_ms`, `cost_usd`, `text_purged_at` |
| `voice_terms` | Slovník (`term` + `heard_as[]`) a zkratky (`snippet` + `expansion`) | `kind`, `term`, `heard_as`, `expansion`, `source`, `uses` |
| `voice_rules` | Pravidla stylu a blokované fráze (vestavěné, ruční, naučené) | `kind`, `text`, `mode` (`always`/`alone`), `active`, `source` |
| `voice_corrections` | Dvojice oprav „slyšel → opravil" | `dictation_id`, `heard`, `fixed` |
| `voice_suggestions` | Návrhy z učení ke schválení | `kind`, `payload`, `evidence`, `examples[]`, `source` (`rules`/`ai`), `status`, `dedupe_key` |
| `voice_settings` | Klíč → hodnota | `styles`, `typing_wpm`, `text_retention_days`, `cleanup_enabled`, `auto_learn_terms`, `store_text`, `daily_cost_cap_usd` |

`status` diktátu: `ok` učesaný · `raw` čištění odmítnuté, vrácen přepis · `snippet` zkratka ·
`empty` nic se neřeklo · `blocked` pojistka zahodila celý přepis · `error` přepis selhal ·
`cancelled` Esc.

Kategorie (`category`): `email`, `work_msg`, `personal_msg`, `ai_prompt`, `document`, `other`
— podle bundle id aplikace (Mail, Outlook → e-mail; Slack, Teams → pracovní zprávy; Zprávy,
WhatsApp, Messenger → osobní; Claude, ChatGPT, Terminál, Cursor → zadání pro AI; Pages, Word,
Notion → dokument). U prohlížeče rozhoduje nápověda z titulku okna, která se **neukládá**.

Retence (D-V7, změněno ve VO00): **text zůstává natrvalo**, dokud ho Kryštof nesmaže v Historii
(jeden diktát, období, vše). `text_retention_days` je ve výchozím stavu `NULL` = bez výmazu;
nastaví-li ho Kryštof, denní úklid (`client-retention`) maže `raw_text`, `final_text`,
`edited_text` starší diktátů a nastaví `text_purged_at`. `voice_corrections` a vyřízené návrhy
nemají vlastní lhůtu: patří k diktátu (`ON DELETE CASCADE`), takže je smaže smazání diktátu.
Smazání zařízení diktáty neruší (`ON DELETE SET NULL`). Žádost GDPR o výmaz zmínky o klientovi
se řeší hledáním v Historii a smazáním nalezených diktátů (VO10).

---

## 7. Kontrakt Mac ↔ server

Všechno pod `/api/public/voice/*`. Volá jen aplikace, ne prohlížeč: bez CORS, bez cookie,
**požadavek s hlavičkou `Origin` dostane 403**. Adresa vždy `https://www.zakaziq.cz` (apex
přesměrovává 308 a hlavička s klíčem by se ztratila, poučení z R-136), ve vývoji
`http://localhost:3000`.

**Klíč zařízení:** `zk_voice_<prefix 10>_<tajemství 32>` v `Authorization: Bearer …`.
V DB jen prefix a HMAC-SHA256 s `AGENT_KEY_PEPPER` (doména `voice:`). Ukáže se jednou
v adminu, na Macu leží v Klíčence. Umí jen tyhle cesty.

| Cesta | Co | Tělo / odpověď |
|---|---|---|
| `POST /dictate` | Diktát | multipart: `audio` (m4a, do 4 MB), `meta` (JSON níž) → `{ ok, id, status, text, words, guards }` |
| `POST /feedback` | Oprava po vložení | `{ id, editedText }` → `{ ok, learned }` |
| `GET /config` | Slovník, zkratky, styl, přehled; zároveň „Vyzkoušet připojení" | `{ ok, device, terms, snippets, styles, cleanupEnabled, summary }` |
| `GET /stats?range=7d\|30d\|all` | Čísla pro okno na Macu (stejná jako admin) | `{ ok, today, week, streak, wpm, timeSaved, daily[] }` |
| `GET/POST/DELETE /terms` | Slovník a zkratky z okna na Macu | `{ kind, term, heardAs[], expansion? }` |
| `GET/PATCH /settings` | Styl podle kategorie, „jen čísla", učení | výběr klíčů z `voice_settings` |

`meta` k diktátu:

```json
{
  "id": "uuid z Macu",
  "startedAt": "2026-11-25T14:03:11+01:00",
  "durationMs": 8420,
  "speechMs": 6900,
  "mode": "hold",
  "cancelled": false,
  "app": { "bundleId": "com.apple.mail", "name": "Mail", "titleHint": null }
}
```

Chyby: `{ ok: false, code }` — `UNAUTHORIZED` 401, `ORIGIN_NOT_ALLOWED` 403, `TOO_LARGE` 413,
`UNSUPPORTED_TYPE` 415, `INVALID_META` 400, `RATE_LIMITED` 429, `NOT_CONFIGURED` 503,
`STT_FAILED` 502. Chyba neprozradí, jestli zařízení existuje. Mac opakuje jen síťové chyby,
502 a 429 (s čekáním), ne 4xx.

Server dál: Zod na všech vstupech, `readFormDataLimited`/`readJsonLimited`, kontrola prvních
bajtů souboru (`ftyp` u m4a), limit po IP (`isApiRateLimited`) i po zařízení, `maxDuration = 60`,
v logu nikdy text diktátu (`lib/security/log-safe.ts`). Diktát starší než 30 dní nebo z
budoucnosti se nepřijme.

---

## 8. Statistiky

Den = pražský den (`lib/prague-time.ts`), dotazy porovnávají okamžiky (`started_at >= …`),
ne `AT TIME ZONE` ve WHERE (R-093).

| Číslo | Definice |
|---|---|
| Slova | Počet slov ve vloženém textu (`words`) u stavů `ok`, `raw`, `snippet`. Ostatní stavy se nepočítají |
| Slova dnes / týden / celkem | Součet slov za pražský den, posledních 7 dní, vše |
| Diktáty | Počet diktátů se slovy > 0 |
| Rychlost | Σ slov / Σ minut řeči (`speech_ms`, chybí-li, `duration_ms`), jen diktáty s řečí ≥ 2 s |
| Ušetřený čas | Σ (slova / `typing_wpm` − minuty řeči), nejméně 0; `typing_wpm` výchozí 40 |
| Série | Po sobě jdoucí dny se ≥ 1 slovem končící dneškem, nebo včerejškem, když dnes ještě nic. Nejdelší série zvlášť |
| Opravy systémem | `dictionary_fixes` + `words_corrected` (jako „Fixes made by Flow") |
| Opravy po vložení | Podíl diktátů s `user_edits > 0` po týdnech = **měřítko učení**, má klesat |
| Kategorie, aplikace | Podíl slov podle `category` a `app_name` |
| Heatmapa | 26 týdnů × 7 dní, pásma slov 0 · 1–249 · 250–499 · 500–749 · 750+ (jako Wispr Flow) |
| Kdy diktuji | Slova podle hodiny dne |
| Kvalita | Pojistky (kolikrát a které), chyby, `blocked`, `raw`, latence p50/p95 (`total_ms`) |
| Náklady | Σ `cost_usd` za den a měsíc, v dolarech (poskytovatelé účtují v USD, měny se nesčítají) |

---

## 9. Vzhled

Všechno podle Dílků (`zakaziq-design-dilky`, `DESIGN.md`). Barvy pro Mac jako hex z
`app/tokens-dilky.css`:

| Token | Hex | Použití v aplikaci |
|---|---|---|
| `navy-950` | `#0c1a36` | pozadí lišty, text |
| `navy-700` | `#23478b` | hlavní akce v okně |
| `navy-600` → `navy-800` | `#2b57a8` → `#1b3868` | přechod v ikoně (logo) |
| `navy-300` | `#8aaee3` | vlnky při mluvení |
| `navy-200` | `#b8ceef` | text na tmavé liště |
| `ground` | `#f4f6fb` | pozadí okna |
| `quiet` | `#4a5878` | popisky |
| `signal` | `#ffb547` | jen „čeká na vás" (návrhy ke schválení), ne nahrávání |
| `danger` | `#b3261e` | chyba |

Logo: zaoblený čtverec s přechodem `#2b57a8 → #1b3868` a čtyřmi bílými dílky 2×2
(`public/ikony/ikona.svg`, `ikona-512.png`). Ikona v liště menu = 2×2 dílky jako šablonový
obrázek (kreslí se v kódu).

### Lišta (pilulka)

Náhled stavů: `new - area of zakaziq/prompty/voice/podklady/lista-nahled.html`.

| Stav | Velikost | Vzhled |
|---|---|---|
| Klid | 48 × 14 px | tmavá pilulka (`navy-950`, 85 %), uprostřed mřížka 2×2 bílých dílků po 4 px |
| Najetí myší | 184 × 32 px | dílky 10 px + „Podržte fn a mluvte" (Instrument Sans 12, `navy-200`) |
| Poslouchá | 216 × 36 px | dílky svítí podle hlasitosti, 16 svislých vlnek `navy-300`, čas (JetBrains Mono 11) |
| Bez držení | 252 × 36 px | jako Poslouchá, navíc tlačítka Zrušit (×) a Hotovo (■), plocha 28 px uvnitř lišty |
| Zpracovává | 96 × 28 px | dílky se rozsvěcují dokola (600 ms) |
| Hotovo | — | dílky krátce bliknou (300 ms) a lišta se vrátí do klidu |
| Chyba | 248 × 32 px | okraj `danger`, krátká věta („Bez připojení, diktát počká"), 3 s; klik otevře Historii |

Pravidla: okno lišty **nikdy nebere focus** (jinak by se nevložilo), je na všech plochách
i nad aplikací na celé obrazovce, je na obrazovce s kurzorem 12 px nad Dockem, při
„omezit pohyb" bez vlnek a animací, v Nastavení jde skrýt v klidu.

### Okno ZakazIQ Voice (jako Wispr Flow)

Levý pruh: logo, Domů, Historie, Slovník, Styl, Nastavení. Pozadí `ground`, karty bílé.

- **Domů:** „Dnes jste nadiktovali 1 240 slov", sloupce slov za 7 dní, série s tečkami dnů,
  rychlost slov za minutu, ušetřený čas, posledních 10 diktátů (aplikace, čas, text, kopírovat).
- **Historie:** hledání, kopírovat, zkusit znovu (u diktátů ve frontě nebo s chybou), smazat.
- **Slovník:** slova (správný tvar + jak to přepis slyší), zkratky (zkratka → text), co se
  naučilo samo.
- **Styl:** pro každou kategorii Formální / Neutrální / Osobní / Přesně (pro zadání AI), s
  ukázkou.
- **Nastavení:** zkratka (Fn, pravý ⌥), mikrofon, zvuky, spustit po přihlášení, lišta v klidu,
  připojení (adresa, klíč zařízení, Vyzkoušet), soukromí (ukládat text / jen čísla, učit se
  z oprav), oprávnění (Mikrofon, Sledování vstupu, Zpřístupnění, s tlačítky do Nastavení systému).

### Admin `/dashboard/voice`

`PageShell` + `PageHeader`, karty `Card`/`CardHead`, záložky `PillNav` (`?tab=`): **Přehled ·
Historie · Učení · Slovník · Nastavení**. Grafy jako SVG ze serveru (vzor
`components/client-web/web-leads-chart.tsx`, skill `dataviz`), CSP beze změny. Texty podle
`zakaziq-ux-texty-cs`. Návrhy ke schválení mají tón `signal`. Přijmout a odmítnout jde vrátit
(Zpět v toastu).

---

## 10. Sezení

Jedno sezení = jedna nová konverzace v Claude Code. **„Mac"** = musí běžet v Claude Code na
MacBooku (potřebuje `swift`, mikrofon a oprávnění). Serverová sezení jdou na Macu i v cloudu.

| # | Sezení | Kde | Odhad | Potřebuje |
|---|---|---|---|---|
| VO00 | Příprava: plán do repa, větev, rozhodnutí R-150, ceny a test přepisu češtiny | Mac | 1–2 h | — |
| VO01 | Databáze (migrace 138) a klíč zařízení, v adminu Zařízení | kdekoli | 2 h | VO00 |
| VO02 | Příjem diktátu: přepis, pojistky, slovník, `dictate` a `config` | kdekoli | 3–4 h | VO01 |
| VO03 | Mac: kostra aplikace, značka, oprávnění, připojení | Mac | 2–3 h | VO01 |
| VO04 | Mac: Fn a nahrávání | Mac | 2–3 h | VO03 |
| VO05 | Mac: lišta s mřížkou dílků | Mac | 2–3 h | VO04 |
| VO06 | Mac: odeslání, vložení, historie, fronta → **milník 1** | Mac | 2–3 h | VO02, VO05 |
| VO07 | Čištění textu a kontrola proti halucinacím, zlatá sada → **milník 2** | kdekoli | 3 h | VO02 |
| VO08 | Učení z logů (server), slovník a nastavení přes API | kdekoli | 3 h | VO07 |
| VO09 | Mac: zachycení oprav po vložení | Mac | 2 h | VO06, VO08 |
| VO10 | Admin stránka ZakazIQ Voice a karta na Dnes → **milník 3** | kdekoli | 3–4 h | VO02 (data z VO06) |
| VO11 | Mac: okno jako Wispr Flow | Mac | 3–4 h | VO06, VO08, VO10 |
| VO12 | Nasazení, ostrý týden, ladění → **milník 4** | Mac | 2 h + týden | vše |

Celkem asi **30–40 hodin**. Analýza počítala 21–33 h pro jádro; navíc je okno jako Wispr Flow
a celé učení.

**Mac (zjištěno ve VO00, 2026-11-25):** macOS 15.7.4 (24G517), Apple Swift 6.1.2 (arm64),
jen **Command Line Tools** (`/Library/Developer/CommandLineTools`, Xcode.app není). V Klíčence
**0 identit pro podpis kódu** — certifikát „ZakazIQ Voice vývoj" je potřeba vytvořit před
VO03 (postup v `memory/memory.md` → Otevřené problémy). `ffmpeg` je nainstalovaný, `sox` ne.

**Milníky:**

1. **Diktuji Fn** (VO06): podržím Fn, mluvím, pustím, text se vloží. Přepis a pojistky, zatím bez čištění.
2. **Nevymýšlí si** (VO07): text je učesaný a kontrola vrací přepis, když model ujede.
3. **Vidím a učí se** (VO08–VO10): admin ukazuje slova za den a aktivitu, opravy se mění ve slovník.
4. **Jako Wispr Flow** (VO11–VO12): okno na Macu, běží na produkci, týden ostrého provozu.

**Nejkratší cesta k „diktuji":** VO00 → VO01 → VO02 → VO03 → VO04 → VO06 (lišta jen prostá,
VO05 se doplní potom). VO07 a VO10 jdou dělat souběžně s Mac sezeními.

**Co musí být hotové, aby to mělo smysl** (minimum): VO00–VO07 a VO10. Zbytek přidává učení
a pohodlí.

---

## 11. Proměnné prostředí

| Proměnná | Kde | Poznámka |
|---|---|---|
| `GROQ_API_KEY` | nová, server | console.groq.com; do `.env.local` ji vkládá Kryštof, do Vercelu Production ve VO12 (sensitive) |
| `VOICE_STT_PROVIDER` | nová, volitelná | `groq` (výchozí) / `openai` |
| `VOICE_GROQ_STT_MODEL` | nová, volitelná | výchozí `whisper-large-v3-turbo` |
| `VOICE_OPENAI_STT_MODEL` | nová, volitelná | záloha, výchozí podle `lib/transcribe.ts` |
| `OPENAI_API_KEY` | existuje | záloha přepisu |
| `ANTHROPIC_API_KEY` | existuje | čištění a rozbor (role `fast`, `smart`) |
| `AGENT_KEY_PEPPER` | existuje | HMAC klíče zařízení |

Každou novou do `.env.example` a do tabulky env v `docs/AGENTS-REFERENCE.md` → A. Názvy
modelů Claude jen v `lib/ai/models.ts` (hlídá test).

---

## 12. Náklady

Ceny jsou v kódu na jednom místě (`lib/admin/voice/costs.ts`), náklad každého diktátu je
v `cost_usd`. Strop D-V11.

### Ceník (ověřeno 2026-11-25)

| Služba | Cena | Podmínky | Zdroj |
|---|---|---|---|
| Groq `whisper-large-v3-turbo` | **$0,04 / h** zvuku | nejkratší účtovaná délka **10 s** na požadavek; soubor do 25 MB (free), 100 MB (dev); m4a podporované | console.groq.com/docs/speech-to-text |
| Groq `whisper-large-v3` | $0,111 / h | totéž | tamtéž |
| Groq limity | 20 požadavků/min, 2 000/den, 7 200 s zvuku/h, 28 800 s/den | stránka uvádí základ pro Developer plan, hodnoty free plánu nepotvrzené (vidět jsou jen v console.groq.com/settings/limits) | console.groq.com/docs/rate-limits |
| OpenAI `gpt-4o-transcribe` | $0,006 / min (odhad OpenAI) | $2,50 / $10 za 1M tokenů | developers.openai.com/api/docs/pricing |
| OpenAI `gpt-4o-mini-transcribe` | $0,003 / min (odhad OpenAI) | $1,25 / $5 za 1M tokenů; tenhle model je dnes v `.env.local` | tamtéž |
| Claude Haiku 5.5 (role `fast`) | $0,10 vstup / $0,50 výstup za 1M tokenů | do 100K tokenů promptu; přemýšlení se platí jako výstup (čištění ho vypíná); `temperature` jiná než výchozí = 400 | ceník Claude API (stav 2026-11-03), znovu ověřeno 2026-11-26 v referenci Claude API |
| Claude Sonnet 5.5 (role `smart`, týdenní rozbor) | $2 / $10 za 1M tokenů | | tamtéž |

Groq parametry (tamtéž): `verbose_json` vrací segmenty s `avg_logprob`, `compression_ratio`
a `no_speech_prob`; `language` (ISO 639-1) zrychluje i zpřesňuje; `prompt` nejvýš **224 tokenů**
(plánovaných 600 znaků nápovědy se do toho musí vejít — VO02 hlídá tokeny, ne znaky);
`timestamp_granularities` `word`/`segment` jen s `verbose_json`.

Groq a data (console.groq.com/docs/your-data, DPA účinné od 2025-10-15): ve výchozím stavu vstupy
ani výstupy **neuchovává**; u přepisu je může logovat **až 30 dní** kvůli spolehlivosti
a zneužití. **Zero Data Retention** jde zapnout v Data Controls — doporučené, dělá Kryštof.
Data v GCP v USA, předávání na standardní smluvní doložky, DPA s lhůtou oznámení porušení 72 h.
Že se vstupy nepoužívají k učení modelů, výslovně nikde nestojí; DPA jen omezuje zpracování
na poskytování služby. Zápis zpracovatele do `.claude/security/DECISIONS.md` dělá VO02.

### Odhad pro 3 000 slov denně

Předpoklady (odhad, ne měření): mluvím asi 130 slov za minutu, tedy ~23 min řeči; nahrávka
s pauzami ~28 min zvuku; průměrný diktát ~30 slov (~14 s), tedy ~100 diktátů denně, skoro
všechny nad 10 s. Čištění ~1 500 tokenů vstupu (pravidla, slovník, příklady, přepis)
a ~230 výstupu včetně přemýšlení na diktát.

| Položka | Denně | Za 30 dní |
|---|---|---|
| Přepis Groq turbo | ~$0,019 | ~$0,56 |
| Čištění Haiku 5.5 (100 × 1 500 + 230 tokenů) | ~$0,027 | ~$0,80 |
| Týdenní rozbor Sonnet 5.5 (~10K vstup + 2K výstup týdně) | — | ~$0,17 |
| **Celkem hlavní cesta** | | **~$1,5** |
| Kdyby přepis šel celý přes OpenAI `gpt-4o-transcribe` / mini | ~$0,17 / ~$0,08 | ~$5,0 / ~$2,5 |

Vychází to na spodní hranu původního odhadu (16–60 Kč měsíčně, v korunách podle kurzu dne).
Wispr Flow Pro stojí asi 264 Kč. Denní strop D-V11 (1 USD) je ~35× nad očekávanou denní útratou,
zastaví jen chybu ve smyčce.

### 12a. Test přepisu češtiny (VO00, 2026-11-25)

Skript `scripts/voice-stt-test.mjs` (WER po malých písmenech bez interpunkce, ticho = počet
vymyšlených slov, u Groq navíc výsledek po pojistce G2). Nahrávky mimo repo v
`~/ZakazIQ-voice-test/`.

**Zatím jen syntetický hlas** (macOS `say -v Zuzana`, 9 vět + 5 s ticha, `syntetika/`) a **jen
OpenAI `gpt-4o-mini-transcribe`** — klíč Groq v `.env.local` ještě není. Syntetický hlas je
čistší než skutečný, čísla jsou tedy spíš optimistická.

| Poskytovatel | Nápověda | WER průměr | WER nejhorší | Ticho (vymyšlená slova) | p50 / p95 času |
|---|---|---|---|---|---|
| OpenAI `gpt-4o-mini-transcribe` | bez | 11,6 % | 46,2 % (čísla a datum slovy) | 0 | 904 / 2 945 ms |
| OpenAI `gpt-4o-mini-transcribe` | `ZakazIQ, Prvotka, VIZEON, SmartCalendar, Vercel, Turbopack` | 5,5 % | 18,2 % („ZakasIQ", „Vizeon") | **6 — opsal celou nápovědu** | 808 / 1 777 ms |

Co z toho plyne:

- **Nápověda ze slovníku pomáhá** (WER na polovinu, čísla a „SmartCalendar" správně), ale
  **na tichu se vrací jako přepis**. Proto nová pojistka **G12** (oddíl 4) a G1 musí na Macu
  ticho vůbec neposílat.
- Bez nápovědy přepis píše čísla slovy („čtyřicet osm tisíc", „ve čtrnácti celých třiceti");
  s nápovědou číslicemi. Převod čísel řeší čištění (VO07), ne slovník.
- Jména bez nápovědy nepozná („zákaz ITV", „vyzion"): slovník je nutnost, ne bonus.
- **Groq a skutečný hlas chybí.** Po vložení `GROQ_API_KEY` a nahrání asi 10 vět vlastním
  hlasem do `~/ZakazIQ-voice-test/` pustit
  `node scripts/voice-stt-test.mjs ~/ZakazIQ-voice-test` (bez nápovědy i s `--napoveda "…"`)
  a doplnit sem tabulku. Do té doby platí D-V3 podle doporučení.

**Naostro přes server ve VO02 (2026-11-26):** `POST /api/public/voice/dictate` na lokálním serveru, testovací
Neon, OpenAI `gpt-4o-mini-transcribe` (Groq bez klíče), syntetický hlas, slovník ZakazIQ / Prvotka / VIZEON.
Celá cesta na serveru 0,9–1,7 s (první požadavek 3,5 s kvůli sestavení routy), od odeslání po odpověď
0,9–1,9 s. Slovník opravil „ZakazIQ“ a „VIZEON“; „prvotku“ (4. pád) nezná — skloňování řeší učení nebo
čištění. Ticho s `speechMs: 0` → `empty` bez přepisu (G1), ticho bez měření řeči → OpenAI **znovu vrátilo
nápovědu** a G12 ji zahodilo (`blocked`). Čísla dál slovy („čtyřicet osm tisíc“) — VO07.

---

## 13. Rizika

| Riziko | Co s tím |
|---|---|
| Fn otevírá výběr emoji / mění vstup | Aplikace pozná nastavení „Stisknutím 🌐 …" a nabídne cestu do Nastavení systému (nic nemění sama); záložní pravý ⌥ |
| Po novém sestavení macOS zapomene oprávnění | Podpis stálou vlastní identitou (VO03), ne ad hoc |
| Vložení v některé aplikaci nejde | Text zůstane ve schránce, lišta to řekne; v historii jde zkopírovat |
| Whisper si vymýšlí na tichu | G1–G5, zlatá sada, blokované fráze |
| Čištění přidá obsah nebo odpoví | G6–G10, styl „Přesně" pro zadání AI, vypínač |
| Pomalé (Vercel fra1 → poskytovatel v USA) | Měřit p50/p95; krátké diktáty bez čištění; přepis přímo z Macu jako pozdější varianta (D-V2) |
| Náklady ujedou | Limit 400/h na zařízení, denní strop, `cost_usd` v adminu |
| Diktuji osobní údaje klientů | Groq, OpenAI a Anthropic jsou zpracovatelé; text na serveru natrvalo (D-V7, rozhodl Kryštof), proto výmaz v Historii (jeden, období, vše, podle hledání), volba „jen čísla" a volitelná lhůta; u Groq zapnout Zero Data Retention (oddíl 12); zpracovatele zapíše VO02 do `.claude/security/DECISIONS.md` |
| Přepis opíše nápovědu slovníku na tichu | Ověřeno ve VO00 (oddíl 12a): G1 na Macu i serveru, G12 |
| Učení se naučí nesmysl | Samo jen slovo od 3 výskytů, Vrátit; pravidla jen po schválení |
| Zpřístupnění v Electron a webových aplikacích nečte pole | Opravy se tam nezachytí; je to jen ztráta učení, ne chyba |
| Mac spí nebo je offline | Fronta (D-V10) |
| Aktualizace macOS | Jen veřejná API (CGEventTap, AX, AVFoundation, NSPasteboard), žádná soukromá |

---

## 14. Stav sezení

| # | Stav | Datum | Poznámka |
|---|---|---|---|
| VO00 | rozpracováno | 2026-11-25 | Plán na větvi `admin/zakaziq-voice` (worktree `.claude/worktrees/zakaziq-voice`), R-150, ceny ověřené, skript testu přepisu hotový. Chybí: klíč Groq, test Groq a skutečného hlasu, certifikát pro podpis |
| VO01 | hotovo | 2026-11-26 | Migrace 138 v repu a na testovacím Neonu (produkce ne), `/dashboard/voice` se zařízeními, klíč `zk_voice_…`, DECISIONS #057. Za přihlášením neověřené |
| VO02 | hotovo | 2026-11-26 | `POST /dictate`, `GET /config`, G1–G5 a G12, slovník bez diakritiky, záloha OpenAI. Naostro jen přes OpenAI (Groq bez klíče): odpověď 0,9–1,9 s, G1 i G12 zasáhly. S Groq a za přihlášením neověřené |
| VO03 | rozpracováno | 2026-11-26 | `voice-mac/`: lišta menu s dílky, okno Nastavení (adresa, klíč v Klíčence, Vyzkoušet připojení, tři oprávnění), `make test app install`, 24 testů. Odchylky: Swift Testing místo XCTest (Command Line Tools XCTest nemají), logika v knihovně `ZakazIQVoiceCore`, ikona kreslená skriptem `Scripts/AppIcon.swift` místo `sips` z PNG, bez ikon v okně. Ověřeno: testy, sestavení bez varování, vzhled okna (ladicí snímek), klient naživo (apex 308 → zastaveno, 404, nedostupný localhost). **Chybí certifikát „ZakazIQ Voice vývoj"** — bez něj neprošel `make app` se stálým podpisem, instalace ani připojení s klíčem proti `npm run dev` |
| VO04 | v kódu | 2026-11-26 | Větev `admin/voice-mac` (`8a8cf95`): `FnMonitor` (CGEventTap, fn kód 63, pravý ⌥ kód 61 + bit 0x40, pohltí jen Esc), `DictationTrigger` (nahrává hned, 0,3 s, dvojí stisk 0,4 s, Esc, jiná klávesa, 9:30/10:00, pole pro heslo), `Recorder` m4a 16 kHz mono se `speechMs`, volba zkratky a rada k výběru emoji. Odchylka: `prepareToRecord` až při stisku, ne předem (mikrofon by svítil naprázdno). Ověřeno: testy, formát souboru (`afinfo`: m4af, 1 ch, 16 kHz, AAC, `ftyp`). **Naostro (Fn, mikrofon, Esc v dialogu, pole pro heslo) neověřeno**: chybí certifikát a zkoušku dělá Kryštof |
| VO05 | v kódu | 2026-11-26 | `de7306a`: `NSPanel` bez focusu na všech plochách, pilulka ve stavech z náhledu, dílky podle hlasitosti a dokola, 16 vlnek, čas, Zrušit/Hotovo, omezit pohyb, volba lišty v klidu. Ověřeno: testy rozměrů a polohy, ladicí PNG všech stavů porovnané s `lista-nahled.html` (písma Dílků načtená). **Neověřeno naostro**: focus při psaní v TextEditu, druhý monitor, celá obrazovka, „omezit pohyb" |
| VO06 | v kódu | 2026-11-26 | `12c486f` + napojení okna `1095f01`: `/dictate` multipart, vložení ⌘V se vrácením schránky podle `changeCount`, jiná aplikace = schránka, G1 na Macu (< 300 ms řeči), zrušení jen jako `meta`, fronta v SQLite (24 h, 5–60 s / `Retry-After`, síť + každou minutu, nevkládá se sama), historie 90 dní, menu Zkopírovat poslední diktát a fronta, zvuky. Odchylka: celkový čas po vložení jen v místní historii (`meta` je na serveru `.strict()`). Ověřeno: 80 testů celkem, tělo ze Swiftu prošlo serverovým `readFormDataLimited` + `dictationMetaSchema`. **Milník 1 naostro neověřený**: tabulka aplikací a p50 chybí (potřeba certifikát, klíč a zkouška na Macu) |
| VO07 | hotovo | 2026-11-26 | Čištění Claude `fast` (bez přemýšlení a bez `temperature`), G6–G11 + otočený zápor, strop s upozorněním jednou denně, zlatá sada 69 případů v `npm test`, `scripts/voice-eval.mjs`. Odchylky: G7 u krátkých 0,25× (samoopravy), G3 neslučuje čísla, výplňová slova a „nový řádek" bez modelu. **Se skutečným modelem ani na Macu zatím neověřeno** (`voice-eval.mjs --ano` čeká na Kryštofa) |
| VO08 | hotovo | 2026-11-26 | `POST /feedback` (jen diktát téhož zařízení do 24 h), rozdíl LCS po slovech, slovo se naučí samo při ≥ 3 stejných opravách za 60 dní (2× nic), blokovaná fráze jen jako návrh při ≥ 2 celých smazáních, rozbor AI v pondělí (≥ 8 opravených diktátů od minula, jen návrhy pravidel s ≥ 2 příklady), `/terms` a `/settings` z Macu (rozsah `write` 120/h), úklid textu i dvojic po lhůtě, „Spustit učení teď“ v adminu. Odchylky: pravidlo „krátká nahrávka 3×“ z návrhu se nestavělo; při „jen čísla“ oprava uloží jen počet slov; úklid maže i dvojice oprav. Ověřeno nad PGlite (route i učení) a `curl` proti lokálnímu serveru s testovacím Neonem (3 stejné opravy → slovo v `/config` a `/terms`, cizí původ 403; zkušební data smazaná). **Rozbor se skutečným modelem, tlačítko za přihlášením a oprava z Macu (VO09) neověřené** |
| VO09 | hotovo | 2026-11-26 | Sezení `zakaziq-e2` (`7bd4836`), sloučeno `5a9b88c`, napojeno `bb9d822`: FocusReader, EditWatcher, EditLocator s testy, fronta oprav 24 h, `POST /feedback`; watcher jen po skutečném vložení a s volbou Učit se z mých oprav, Enter čte pole před odesláním, nový diktát a ukončení aplikace pošlou rozpracovanou opravu. 94 testů. **Za běhu v aplikacích neověřeno** (tabulka funguje/nefunguje čeká na ostrý průchod) |
| VO10 | hotovo | 2026-11-26 | `/dashboard/voice` s pěti záložkami, karta Diktování na Dnes, `GET /stats`, `summary` v `/config`, `scripts/voice-seed.mjs`. Odchylky: `requireAuth` místo neexistujícího `requireAdminPage`, bez migrace stránka chytá chybu schématu (jedno kolo) místo `batchTolerant`, ukázková data se značkou aplikace „Ukázka …“ a `ukazka.*`. Vzhled ověřený na dočasné stránce se skutečnými ukázkovými daty z testovacího Neonu (390/768/1280/1440 px, bez přetečení a chyb v konzoli). **Za přihlášením ani Přijmout/Zpět v prohlížeči neověřené** (jen PGlite), „Spustit učení teď“ přidá VO08 |
| VO11 | hotovo | 2026-11-26 | Sezení `zakaziq-e2`, `baf0150`, sloučeno do `admin/voice-mac` (`b61a007`): okno s pěti záložkami, čísla z `/stats` s cache, slovník `/terms`, styl a soukromí `/settings`, SMAppService, úvod; ověřeno ladicím snímkem všech záložek s vymyšlenými daty (`ZAKAZIQ_VOICE_DEMO=1`, jen DEBUG), za běhu proti serveru a s místní historií neověřeno. Napojení na menu, lištu a `LocalDB` `1095f01` |
| VO12 | čeká | | |

---

## 15. Mimo rozsah

iPhone a Windows · úpravy označeného textu hlasem (Command Mode) · šeptání · překlad · tým
a víc uživatelů · napojení na Workspace pro klienty · lokální přepis bez sítě (whisper.cpp
nebo přepis od Applu, pozdější varianta) · ztlumení hudby při diktování · notářsky podepsaná
aplikace a distribuce dalším lidem.

---

## 16. Hotovo celé, když

- Na MacBooku podržím Fn kdekoli, nadiktuji česky a text se vloží do 1,5 s (p50), bez
  vymyšlených vět na tichu.
- Lišta i okno vypadají jako ZakazIQ (Dílky, logo), okno má Domů, Historii, Slovník, Styl
  a Nastavení.
- V adminu vidím slova za každý den, sérii, rychlost, ušetřený čas, kategorie, aplikace
  a heatmapu; na Dnes kartu s dnešními slovy.
- Opravy po vložení se mění ve slovník a návrhy; podíl opravených diktátů po týdnech klesá.
- Všechno je na produkci, týden ostrého provozu prošel a zjištění jsou v paměti.
