# Growth OS → admin ZakazIQ: hovory od asistenta, schůzky a e-mail jedním klikem

> Plán propojení Kryštofova systému Growth OS (repozitář `vizeon-autopilot`, AI hovory přes ElevenLabs,
> ukázkové weby, e-maily přes Resend) s adminem ZakazIQ. Rozhodnutí **R-112** v `memory/memory.md`,
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

## 4. Kroky a stav

| # | Co | Stav |
|---|---|---|
| 1 | Příjem z Growth OS: migrace 114, `POST /api/public/outreach`, oznámení do zvonku; v autopilotu synchronizace z D1 | **v kódu 2026-11-17** (ZakazIQ větev `admin/growth-hovory`, autopilot větev `claude/zakaziq-admin-sync`), nenasazeno |
| 2 | Fronta „Komu zavolat" v Hovorech: řazení podle naléhavosti, shrnutí, ukázka, „Zavolat", „Převzít do Hovorů" (plánovaný hovor v kalendáři), „Nemá zájem" se Zpět | **v kódu 2026-11-17**, v prohlížeči neověřeno |
| 3 | Google Kalendář + Meet: propojení Google účtu v Profilu (OAuth, scope `calendar.events`, refresh token šifrovaně v DB), „Schůzka domluvena" → událost s `conferenceData` (Meet) + `calendar_events` | čeká na odpovědi v oddílu 5 |
| 4 | E-mail jedním klikem: šablona (ukázka, vizeon.cz, termín, Meet), náhled, odeslání se Zpět 60 s, záznam ke kontaktu | čeká na odpovědi v oddílu 5 |
| 5 | Asistent (R-111): „domluv Novákovi schůzku ve čtvrtek ve 3 a pošli pozvánku" — schůzka sama, e-mail na klepnutí | po krocích 3 a 4 |
| 6 | Zpětný kanál do Growth OS: „nevolat" a „zakázka" z adminu do D1, ať robot nevolá | po kroku 2 v provozu |
| 7 | Sledování otevření ukázky a e-mailu v Growth OS (sledovací odkaz / Resend), ať fronta ví „otevřel ukázku" | práce v autopilotu |

## 5. Otevřené otázky (rozhoduje Kryštof)

1. **Odkud posílat e-mail klientovi (krok 4)?** Resend z vizeon.cz (sledování otevření, opraví i
   nefunkční Gmail v adminu — Otevřené problémy, 535 od 2026-08-18) × Gmail (zpráva v Odeslaných,
   nové heslo aplikace). Doporučení: Resend s odpovědí na Kryštofův e-mail. Mění R-004.
2. **Google účet (krok 3):** obyčejný Gmail, nebo Google Workspace na vizeon.cz? Mění nastavení
   přihlášení. Pozor: aplikace v Google Cloud v režimu „Testing" vydává přístup jen na 7 dní —
   musí být „In production" (pro vlastní účet bez ověřování Googlem).
3. **Pozvánka od Googlu:** má klientovi přijít i pozvánka z Google Kalendáře (`sendUpdates=all`),
   nebo jen náš e-mail s Meet odkazem?
4. **Retence `outreach_leads`:** jak dlouho držet firmy, které nemají zájem nebo se nikdy
   neozvaly. Návrh: 12 měsíců od posledního snímku, převzaté do Hovorů se řídí retencí Hovorů.

## 6. Co nasadit (krok 1 a 2)

1. Vygenerovat klíč (`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`), dát ho do
   Vercelu ZakazIQ jako `GROWTH_OS_API_KEY` (Production) a do GitHub Secrets `vizeon-autopilot`
   pod stejným názvem.
2. Migrace 114 na produkční Neon (aditivní, smí jít před nasazením).
3. Nasadit ZakazIQ (merge `admin/growth-hovory` → `main`, push jen se souhlasem).
4. Pushnout `claude/zakaziq-admin-sync` v autopilotu do `main` (= nasazení, jen na pokyn Kryštofa).
5. Jednou spustit workflow „Synchronizace do ZakazIQ" s volbou „všechny" (dotažení historie).
6. Projít Hovory › Od asistenta na telefonu a na počítači.
