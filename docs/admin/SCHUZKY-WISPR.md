# Schůzky z Wispr Flow do ZakazIQ (R-144)

Kryštof nahraje schůzku ve Wispr Flow → ZakazIQ ji dostane i s doslovným přepisem → AI udělá
shrnutí, body dohody, kdo co udělá a pozná klienta → Kryštof potvrdí klienta jedním kliknutím
(chybějící údaje se doplní do kontaktu) → v Gmailu krystof@vizeon.cz čeká koncept e-mailu
se shrnutím. Přepis zůstává jen v ZakazIQ (`/dashboard/schuzky`).

## Jak data tečou

```
Wispr Flow ──(konektor MCP)──▶ naplánovaná úloha Clauda (každou hodinu)
                                  │  GET  /api/public/schuzky?ids=…   které už ZakazIQ má
                                  │  POST /api/public/schuzky         nová schůzka + přepis
                                  ▼
ZakazIQ: meeting_notes ─after()─▶ jistá shoda klienta (e-mail účastníka, kalendář)
                                ─▶ AI (smart): shrnutí, dohody, kroky, kandidát
                                ─▶ koncept v Gmailu, když je klient jistý a má e-mail
                                ─▶ zvonek „Přepis schůzky: …"
```

Wispr Flow nemá API ani webhook a jeho konektor se přihlašuje jen v prohlížeči, takže ZakazIQ
si data stáhnout neumí. Most je proto Claude s konektorem Wispr Flow. Kdyby úloha neběžela,
přepis jde vložit ručně: Schůzky › Vložit přepis (ve Wispr Flow „Copy as Markdown").

## Nastavení (jednou)

1. **Migrace 134** na produkčním Neonu (`migrations/134_schuzky_prepisy.sql`, aditivní).
2. **Klíč mostu:** vygenerovat dlouhý náhodný řetězec (např. `openssl rand -hex 32`) a uložit do
   Vercelu jako `MEETING_NOTES_API_KEY` (Production). Bez něj vstup odmítá všechno (401).
3. **Gmail API** zapnout v Google Cloud projektu `zakaziq-admin` (APIs & Services → Enable APIs →
   Gmail API). Pak v adminu **Profil → Google → Propojit znovu**: přibylo oprávnění
   `gmail.compose` (jen koncepty, kód nic neodesílá). Bez toho schůzky fungují, jen koncept
   nevznikne a detail řekne proč.
4. **Naplánovaná úloha** na claude.ai/code (Routines) — **založená 2026-11-25:**
   „Most Wispr Flow → ZakazIQ (schůzky)", `trig_013Y7qZxCW55vP1K6THsPR55`, každou hodinu v :17 UTC
   (`17 * * * *`), model Sonnet 5.5, jen konektor **Wispr Flow**, repozitář ProjectIQ (kvůli
   `scripts/wispr-most.mjs`), nástroje Bash, Read, Write, Glob, Grep a `mcp__Wispr-Flow`.
   Správa: https://claude.ai/code/routines/trig_013Y7qZxCW55vP1K6THsPR55
   - prostředí **„ZakazIQ most Wispr"** (`env_015BA5v9MaLnGvERWcuTKist`, cloud): síť *Limited*,
     jediná povolená doména `www.zakaziq.cz`, správci balíčků vypnutí; *Network secret* pro
     hostitele `www.zakaziq.cz`, hlavička `Authorization`, prefix `Bearer`, token = klíč z bodu 2.
     Úloha klíč nevidí, proxy ho přidá sama. Do textu úlohy ani do proměnných prostředí nepatří.
   - výměna klíče: nová hodnota ve Vercelu (`vercel env rm` + `vercel env add … --sensitive`),
     redeploy a tatáž hodnota v Network secrets prostředí.

## Text úlohy

```
Jsi most mezi Wispr Flow a ZakazIQ. Nic jiného nedělej, nic neměň v repozitáři (žádné úpravy souborů repa, žádný commit ani push). Pracuješ v kořeni repozitáře ProjectIQ. Klíč k ZakazIQ přidává k požadavkům na https://www.zakaziq.cz proxy prostředí sama — žádnou hlavičku Authorization ani klíč nepřidávej a nehledej.

1. Spočítej datum před 3 dny: date -u -d '3 days ago' +%Y-%m-%dT%H:%M:%SZ
   Přes konektor Wispr Flow zavolej search_meetings se sort "start" a since = to datum.
   Ber jen schůzky, které jsou finalized, mají has_transcript a trvaly aspoň 1 minutu.
   Když žádná taková není, napiš „Nové schůzky: 0“ a skonči.
2. Zjisti, které už ZakazIQ má (nejvýš 100 id najednou, oddělená čárkou):
   curl -sS "https://www.zakaziq.cz/api/public/schuzky?ids=<id1>,<id2>,…"
   Pokračuj jen se schůzkami, které nejsou v poli "known". Když odpověď není success:true, napiš kód a text chyby a skonči.
3. Pro každou novou schůzku:
   a) get_meeting s view_transcript {start_char: 0, char_limit: 40000}. Dokud přepis končí
      řádkem "(...truncated, N chars remaining; continue with view_transcript.start_char=X...)",
      volej znovu se start_char = X.
   b) Každý kus ulož nástrojem Write do /tmp/schuzky/<id>/casti/cast-<pořadí>.txt (1, 2, 3…) PŘESNĚ tak, jak přišel,
      jen bez řádků <<<…>>> a bez řádku "(...truncated…)". Nic neopravuj, nezkracuj,
      nepřekládej a neshrnuj, ani překlepy a vata. Na konec souboru nepřidávej prázdný řádek.
   c) get_meeting_participants_enriched → účastníci.
   d) Ulož /tmp/schuzky/<id>/meta.json: {"id", "title", "start", "end", "share_link",
      "summary" (pole summary z get_meeting), "participants": [{"name","emails","spoke","role",
      "self"}], "transcript_chars"}. transcript_chars = délka prvního kusu + N z jeho řádku
      "chars remaining" (když první kus zkrácený nebyl, je to jeho délka). start a end jako ISO 8601 s časovou zónou (např. 2026-11-24T14:00:00Z).
   e) node scripts/wispr-most.mjs --meta /tmp/schuzky/<id>/meta.json \
        --parts /tmp/schuzky/<id>/casti --out /tmp/schuzky/<id>/telo.json
   f) curl -sS -X POST https://www.zakaziq.cz/api/public/schuzky \
        -H 'Content-Type: application/json' --data-binary @/tmp/schuzky/<id>/telo.json
4. Na konci napiš jen: kolik schůzek bylo nových, kolik se odeslalo, u kterých odpověď
   hlásila "complete": false, a chyby. Obsah schůzek (přepis, shrnutí, jména, e-maily) do výstupu nepiš.
```

## Co kde je

| Co | Kde |
|---|---|
| Tabulka | `migrations/134_schuzky_prepisy.sql` (`meeting_notes`) |
| Vstup mostu | `app/api/public/schuzky/route.ts` (POST, GET `?ids=`), `types/meeting-notes.ts` |
| Ukládání a čtení | `lib/admin/meeting-notes/store.ts` |
| Kdo to je | `lib/admin/meeting-notes/match.ts` (e-mail účastníka, kalendář ±20 min, kandidáti podle jména) |
| AI | `lib/admin/meeting-notes/ai.ts` (model `smart`, strukturovaný výstup, kandidát jen ze seznamu) |
| Tok a potvrzení klienta | `lib/admin/meeting-notes/process.ts` |
| E-mail a Gmail | `lib/admin/meeting-notes/email.ts`, `lib/admin/google/gmail.ts` |
| Obrazovky | `app/dashboard/schuzky/`, `components/admin/meeting-notes/`, blok Schůzky na kartě kontaktu |
| Akce | `app/meeting-notes-actions.ts` |
| Pojistky | `send-reminders` (dokončí nezpracované), `client-retention` (retence) |
| Testy | `lib/__tests__/admin-schuzky-prepisy.test.ts` |

## Pravidla, která drží kód

- **Přepis se nemění.** Uloží se, jak přišel (jen bez značek konektoru `<<<…>>>`), AI ho nepřepisuje.
- **Klienta z návrhu AI potvrzuje Kryštof.** Přepis je text, který mluvil klient (R-111). Sám se
  přiřadí jen jistý klient: e-mail účastníka z Wispr Flow, který má kontakt, nebo jediná událost
  v kalendáři ve stejný čas s kontaktem.
- **Údaje do kontaktu jen do prázdných polí** (R-141), e-mail a telefon jen když je nemá jiný kontakt.
- **E-mail je jen koncept v Gmailu**, adresát je e-mail přiřazeného kontaktu, ne adresa z přepisu.
  V e-mailu jsou jen dohody, kroky a otevřené body; poznámky „Jen pro vás" a přepis do něj nejdou.
- **Retence:** schůzka se maže 3 roky po konání, skrytá po roce; výmaz kontaktu vezme i jeho přepisy.
