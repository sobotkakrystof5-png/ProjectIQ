# Growth OS → admin ZakazIQ: hovory od asistenta, schůzky a e-mail jedním klikem

> Plán propojení Kryštofova systému Growth OS (repozitář `vizeon-autopilot`, AI hovory přes ElevenLabs
> a SIP trunk Odoriku, ukázkové weby, e-maily přes Resend) s adminem ZakazIQ. Rozhodnutí **R-112**
> a **R-120** v `memory/memory.md`,
> na straně Growth OS **D-103** v `growth-os/docs/06-rozhodnuti-a-otevrene.md`. Stav kroků v oddílu 4.

## 1. Cíl

Kryštof chce mít v adminu všechno na jednom místě (zadání 2026-11-17):

1. Vidět, komu po hovoru AI asistenta zavolat, kdy a proč.
2. Jedním klikem zavolat a zapsat výsledek.
3. Když se domluví schůzka: termín v kalendáři a hned odkaz na Google Meet.
4. Jedním klikem poslat klientovi e-mail: ukázka, odkaz na web VIZEONu, termín, Meet odkaz, „těším se".
5. ZakazIQ ví, jakou ukázku a jaký e-mail klient od robota dostal.

## 2. Jak to teče

```
Growth OS (D1: leads, calls, demos, emails)
   │  scripts/zakaziq-sync.mjs — snímky změněných firem
   │  hodinově (zakaziq-sync.yml) + hned po odeslání ukázky (build-demo krok 8)
   ▼
POST /api/public/outreach  (Bearer GROWTH_OS_API_KEY)
   ▼
outreach_leads (migrace 114) ──► Hovory › Od asistenta (fronta „Komu zavolat")
   │  „Převzít do Hovorů" → client_leads + plánovaný hovor v kalendáři
   ▼
[krok 3] „Schůzka domluvena" → Google Kalendář + Meet → calendar_events
[krok 4] e-mail jedním klikem (ukázka, web, termín, Meet) se „Zpět"
[krok 6] zpětný kanál do Growth OS: „nevolat", „zakázka"
```

Rozdělení pravdy: **D1 rozhoduje, komu volá robot** (fronta, seznam nevolat). ZakazIQ drží kopii pro
člověka a to, co s firmou udělal Kryštof (`handled_*`, `client_lead_id`). Snímek tyhle sloupce nepřepíše.

## 3. Kontrakt (verze 1)

Zdroj pravdy je `types/outreach.ts` (ZakazIQ) a `src/zakaziq-admin.mjs` (autopilot). Dávka nejvýš
100 firem, tělo 256 kB. Jedna firma:

| Pole | Význam |
|---|---|
| `external_id` | `vizeon-outreach:<id leadu v D1>`, nikdy se nemění |
| `updated_at` | nejnovější změna firmy, hovoru, ukázky nebo e-mailu; starší snímek novější nepřepíše |
| `company`, `contact_name`, `phone` (`+420…`), `email`, `website`, `industry`, `city` | údaje z importu |
| `status`, `do_not_call`, `attempts` | stav v D1 |
| `last_call` | `at`, `outcome`, `summary` (od modelu + poznámka k webu), `callback_at`, `callback_text` |
| `demo` | `url` (jen https), `status`, `built_at`, `views`, `first_viewed_at` |
| `emails` | `cold_sent_at`, `demo_sent_at`, `opened_at`, `clicked_at`, `replied_at` |

**D1 dnes neeviduje otevření ukázky ani e-mailu** (`demos.views`, `emails.opened_at` se nikde
neplní). Pole v kontraktu jsou připravená; ZakazIQ je začne ukazovat, jakmile Growth OS přidá
sledovací odkaz (`links`, plán Voice Outreach) nebo čtení stavu z Resendu.

### Kontrakt v2 (R-120, 2026-11-18)

Všechno volitelné, snímek v1 projde beze změny. `version: 2`. Chybějící hodnota v ZakazIQ nic
nepřepíše (přepis hovoru, cena…), takže hodinová synchronizace smí posílat hovory **bez přepisu**.
Tělo nejvýš **1 MB** — Growth OS dělí dávky podle velikosti (pod 900 kB).

| Pole firmy | Význam |
|---|---|
| `segment`, `source_batch` | skupina a seznam, ze kterého firma přišla |
| `next_call_after` | kdy robot zavolá znovu (null = už ne) |
| `meeting_at` | schůzka domluvená přímo s robotem (`meetings.starts_at`) |
| `demo.slug`, `demo.preview_url` | slug ukázky a obrázek náhledu (jen `https://navrhy.vizeon.cz/…`) |
| `demo.last_viewed_at`, `demo.max_view_s` | čtení ukázky (až Growth OS začne měřit) |
| `calls[]` | **všechny hovory** firmy (nejvýš 30), tvar jako hovor v reportu bez `company`/`lead_external_id`, navíc `conversation_id` (ElevenLabs), `cost_czk` + `cost_source` (`odorik`/`odhad`), `telephony_status`, `collected` (data collection), `criteria` (všechna hodnoticí kritéria) |
| `email_log[]` | každý e-mail (nejvýš 30): `external_id` `vizeon-email:<id>`, `kind`, `status`, `subject`, `text`, `scheduled_for`, `sent_at`, `delivered_at`, `opened_at`, `clicked_at`, `replied_at`, `bounced_at`, `opens`, `clicks` |
| `status_history[]` | `{at, status}` z `events` (lead.status), nejvýš 60 |
| `research` | `{angle, hook, findings[]}` z rešerše před studeným e-mailem |

Report (`/api/public/outreach/reports`) smí v `calls[]` nést tatáž pole v2 a ve `stats` navíc
`costCzk` a `account` (`odorik_balance_czk`, `elevenlabs_credits_left`, `elevenlabs_credits_limit`,
`checked_at`) — Přehled z nich ukazuje kredity.

**Zpětný kanál:** `GET /api/public/outreach/handled?since=<ISO>` (týž Bearer klíč) vrátí
`{ now, has_more, leads: [{ external_id, handled: 'prevzato'|'nezajem'|null, handled_at, changed_at, meeting_at }] }`
vzestupně podle `changed_at`, nejvýš 500. Growth OS si pamatuje poslední `changed_at`.

**Odorik a ElevenLabs.** Volá agent ElevenLabs „Vizeon hovory" přes SIP trunk Odoriku
(`sip2.odorik.cz`). Growth OS dnes cenu jen odhaduje z délky; skutečnou cenu a stav linky má výpis
hovorů z API Odoriku. **Nahrávky admin nepotřebuje, stačí přepis** (Kryštof 2026-11-18) —
ZakazIQ do ElevenLabs nesahá; `conversation_id` slouží jen k dohledání hovoru v ElevenLabs.

## 4. Kroky a stav

| # | Co | Stav |
|---|---|---|
| 1 | Příjem z Growth OS: migrace 114, `POST /api/public/outreach`, oznámení do zvonku; v autopilotu synchronizace z D1 | **v kódu 2026-11-17** (ZakazIQ větev `admin/growth-hovory`, autopilot větev `claude/zakaziq-admin-sync`), nenasazeno |
| 2 | Fronta „Komu zavolat" v Hovorech: řazení podle naléhavosti, shrnutí, ukázka, „Zavolat", „Převzít do Hovorů" (plánovaný hovor v kalendáři), „Nemá zájem" se Zpět | **v kódu 2026-11-17**, v prohlížeči neověřeno |
| 3 | Google Kalendář + Meet: propojení Google účtu v Profilu (OAuth s PKCE, scope `calendar.events`, obnovovací token šifrovaně v DB), „Domluvit schůzku" → událost s Meetem v Google Kalendáři (bez hostů) + `calendar_events` s `meet_url` + kontakt v Hovorech | **v kódu 2026-11-17**, migrace 115, nenasazeno |
| 4 | E-mail jedním klikem z krystof@vizeon.cz (Resend): úvod od Kryštofa + termín, tlačítko Připojit se ke schůzce, ukázka, vizeon.cz, podpis; odchází po 15 s se Zpět; stav a „Poslat e-mail znovu" v detailu události | **v kódu 2026-11-17**, nenasazeno |
| 5 | Asistent (R-111): „domluv Novákovi schůzku ve čtvrtek ve 3 a pošli pozvánku" — schůzka sama, e-mail na klepnutí | po krocích 3 a 4 |
| 6 | Zpětný kanál do Growth OS: koho Kryštof převzal nebo odložil, ať robot nevolá | **ZakazIQ strana v kódu 2026-11-18** (`GET /api/public/outreach/handled`, migrace 119); Growth OS čtení — zadání v kroku 9 |
| 7 | Sledování otevření ukázky a e-mailu v Growth OS (sledovací odkaz / Resend), ať fronta ví „otevřel ukázku" | práce v autopilotu, zadání v kroku 9 |
| 9 | **AI asistent jako CRM** (R-120): Přehled, Kontakty s filtry, detail klienta (ukázka, všechny hovory s přepisem, e-maily, časová osa), kontrakt v2, zpětný kanál; migrace 119. Zadání pro Growth OS: `new - area of zakaziq/prompty/admin/growth-os-ai-asistent-crm.md` | **ZakazIQ v kódu 2026-11-18**, nenasazeno; Growth OS nezačato |
| 8 | **Sekce AI asistent** (R-118): Kontakty, Reporty den po dni, Analýza (kde hovory váznou) a prompt pro Claude Code; `POST /api/public/outreach/reports`, migrace 116; v autopilotu report po každém kole, `zakaziq:report` pro historii a okamžitá synchronizace po souhlasu (D-105, commit `842dcca`) | **v kódu 2026-11-17**, nenasazeno |

## 5. Rozhodnuto 2026-11-17

1. **E-mail klientovi** jde z `krystof@vizeon.cz` přes **Resend** (doména vizeon.cz, stejný účet
   Resendu jako Growth OS), vlastním klíčem `VIZEON_RESEND_API_KEY`. Odpovědi na krystof@vizeon.cz.
2. **Google účet je Workspace** — OAuth klient typu „Internal", obnovovací token nevyprší.
3. **Pozvánka od Googlu se klientovi neposílá.** Událost v Google Kalendáři nemá hosty; klient
   dostane jen náš e-mail s odkazem na Meet a připojí se rovnou z něj.

**Kde je odkaz na Meet:** v e-mailu klientovi (tlačítko „Připojit se ke schůzce"), v Google
Kalendáři Kryštofa (telefon, počítač, upozornění od Googlu) a v kalendáři adminu — Kalendář, Dnes
i Hovory › Kalendář — v detailu události tlačítko „Připojit se". Oba se připojí stejným odkazem.

**Otevřené:** retence `outreach_leads` (návrh 12 měsíců od posledního snímku); schůzka smazaná
v kalendáři adminu běžnou cestou (ne „Zpět") zůstane v Google Kalendáři — smazat ručně, nebo
doplnit mazání i v Googlu.

## 6. Co nasadit

**Hotovo 2026-11-17 (agent):** `GOOGLE_TOKEN_KEY` a `GROWTH_OS_API_KEY` vygenerované a uložené ve
Vercelu (Production); `GROWTH_OS_API_KEY` se stejnou hodnotou v GitHub Secrets `vizeon-autopilot`.
Hodnoty nikde nezapsané.

**Zbývá (Kryštof), v tomhle pořadí:**

1. **Migrace 114 a 115 na produkci.** `DATABASE_URL` je ve Vercelu citlivá, `vercel env pull` ji
   stáhne prázdnou. Buď Neon → SQL Editor → vložit obsah `migrations/114_hovory_od_asistenta.sql`,
   spustit, pak totéž s `115_schuzky_google_meet.sql` (obě jsou idempotentní), nebo produkční
   connection string do `.env.production.local` a
   `node scripts/apply-migration.js 114_hovory_od_asistenta.sql 115_schuzky_google_meet.sql --env .env.production.local`.
2. **Google Cloud** (účet krystof@vizeon.cz): `gcloud auth login` (pak umí agent založit projekt
   a zapnout Calendar API), nebo ručně v console.cloud.google.com: nový projekt → APIs & Services →
   Library → **Google Calendar API** → Enable → Google Auth Platform / OAuth consent screen, typ
   **Internal** → Clients → Create client, typ **Web application**, Authorized redirect URIs
   `https://www.zakaziq.cz/api/google/callback` a `http://localhost:3000/api/google/callback`.
   Client ID a Client secret do Vercelu (Production) jako `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`.
3. **Resend** (účet s doménou vizeon.cz): API Keys → Create → Sending access, doména vizeon.cz →
   do Vercelu (Production) jako `VIZEON_RESEND_API_KEY`.
4. Dát vědět agentovi: merge `admin/growth-hovory` → `main` a push (produkční deploy), push
   `claude/zakaziq-admin-sync` v autopilotu, workflow „Synchronizace do ZakazIQ" s volbou
   „všechny".
5. Profil → **Propojit Google účet**, pak zkušební schůzka na vlastní e-mail z Hovory › Od asistenta.
