# VO02 — Příjem diktátu: přepis, pojistky, slovník, API

> Sezení pro Claude Code v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`. Jde kdekoli
> (na Macu jde navíc vyzkoušet skutečná nahrávka).

## Cíl jednou větou

Server přijme nahrávku z Macu, přepíše ji, zahodí to, co si přepis vymyslel, opraví slova ze
slovníku a vrátí text; každý diktát zapíše do `voice_dictations`. Čištění AI zatím ne (VO07).

## Než začneš

1. Skill `zakaziq-memory` (začátek), `zakaziq-workspace-backend`, `web-security-memory`.
2. Plán `docs/admin/VOICE-PLAN.md` oddíly 3, 4 (G1–G5 a G12), 6, 7. R-150 a výsledek testu přepisu
   z VO00 (D-V3).
3. Vzory: `app/api/public/web-udalost/route.ts` (veřejný vstup bez prohlížeče, `Origin` = 403),
   `app/api/public/portal/[token]/transcribe/route.ts` a `lib/transcribe.ts` (přepis přes
   OpenAI), `lib/security/request-body.ts`, `lib/api-rate-limit.ts`, `lib/security/log-safe.ts`,
   `lib/prague-time.ts`.
4. Návrh: `podklady/navrh-serveru/` — `stt.ts.txt`, `guards.ts.txt`, `dictionary.ts.txt`,
   `text.ts.txt`, `categories.ts.txt`, `pipeline.ts.txt`, `http.ts.txt`, `store.ts.txt`,
   `dictate.route.ts.txt`, `config.route.ts.txt`. Neověřené.

## Rozsah

- `lib/admin/voice/text.ts` — počítání slov (Unicode písmena a číslice), normalizace bez
  diakritiky pro porovnání.
- `lib/admin/voice/stt.ts` — Groq `POST https://api.groq.com/openai/v1/audio/transcriptions`
  přes `fetch` (multipart: `file`, `model`, `language=cs`, `response_format=verbose_json`,
  `temperature=0`, `prompt` ze slovníku do 600 znaků), timeout 20 s; záloha OpenAI přes
  `lib/transcribe.ts` nebo stejným `fetch` (bez segmentů). Název modelu z env s výchozí
  hodnotou na jednom místě. Vrací text, segmenty, poskytovatele, model, čas, délku zvuku, cenu.
- `lib/admin/voice/guards.ts` — G1 až G5 a G12 (ozvěna nápovědy, zjištěná ve VO00) z plánu (čísla jako konstanty nahoře v souboru).
- `lib/admin/voice/dictionary.ts` — náhrady `heard_as → term` po celých slovech bez ohledu na
  velikost písmen a diakritiku (`dictionary_fixes`), zkratky: celý diktát = spouštěč → text
  zkratky (`status = snippet`), nápověda pro přepis z nejpoužívanějších slov.
- `lib/admin/voice/categories.ts` — kategorie podle bundle id a nápovědy z titulku (oddíl 6).
- `lib/admin/voice/pipeline.ts` — pořadí: G1 → přepis → G12 → G2 → G3 → G4 → G5 → slovník →
  zkratky → (místo pro čištění z VO07, zatím beze změny) → výsledek. Čistá funkce se
  závislostmi předanými zvenku (přepis, čištění), ať jde testovat bez sítě.
- `lib/admin/voice/store.ts` — zápis diktátu, `findDictation(id, deviceId)` pro opakované
  odeslání, načtení slovníku a pravidel jedním dotazem (`adminDb.batch`), `uses += 1` u
  použitých slov. Je-li `store_text` vypnuté, texty se neukládají (jen čísla).
- `lib/admin/voice/http.ts` — ověření klíče (VO01), limit po IP i po zařízení, `Origin` = 403,
  odpovědi `{ ok:false, code }` podle plánu oddíl 7.
- `app/api/public/voice/dictate/route.ts` — multipart do 4 MB + 64 kB (`readFormDataLimited`),
  `meta` přes Zod, kontrola typu a **prvních bajtů** (`ftyp` na pozici 4 u m4a, `RIFF` u wav),
  `maxDuration = 60`, stejné `id` podruhé vrátí uložený výsledek bez přepisu, `cancelled`
  uloží jen řádek.
- `app/api/public/voice/config/route.ts` — slovník, zkratky, styl, `cleanupEnabled`, název
  zařízení (slouží i jako „Vyzkoušet připojení").

## Mimo rozsah

Čištění AI a kontrola výstupu (VO07), `/feedback`, `/terms`, `/settings`, `/stats` (VO08, VO10).

## Testy

- Jednotkové: `guards` (každá pojistka, čísla v opakování zůstanou, `alone` jen u krátké
  nahrávky), `dictionary` (celá slova, diakritika, zkratka), `categories`, `text`.
- `pipeline` s podvrženým přepisem: ticho → `empty` bez volání přepisu, „Titulky vytvořil…" →
  `blocked`, běžná věta → `ok`, chyba přepisu → záloha, obě selžou → `error`.
- `stt` s podvrženým `fetch` (ukázková odpověď `verbose_json` jako soubor v testech).
- Route (`app/api/public/voice/dictate/__tests__/`): bez klíče 401, zneplatněný 401,
  s `Origin` 403, velké tělo 413, špatný typ i podvržené bajty 415, špatné meta 400, limit 429,
  idempotence (dvakrát stejné `id` = jeden řádek, jeden přepis), bez tabulek 503.
  PGlite s migrací 138.

## Ověření naostro

Na Macu s `npm run dev` a klíčem z VO01: vyrob nahrávku (`say -v Zuzana "Dobrý den, posílám
nabídku na nový web pro Prvotku." -o t.aiff && afconvert -f m4af -d aac t.aiff t.m4a`)
a pošli ji `curl` na `http://localhost:3000/api/public/voice/dictate` (klíč si Kryštof vloží
do proměnné prostředí v terminálu sám, ty ho nevypisuješ). Zkus i 5 s ticha. Výsledek
a časy zapiš. V cloudu bez Macu jen testy, napiš to.

## Hotovo, když

- `POST /dictate` vrací text s pojistkami G1–G5 a G12 a slovníkem, `GET /config` vrací slovník.
- Diktát je v `voice_dictations` s časy, poskytovatelem, cenou a kódy pojistek; text
  v logu není.
- Testy, `tsc`, `build:check` prošly.
- `.claude/security/`: STATE (nový veřejný vstup), DECISIONS #057 doplněné (zpracovatelé
  Groq a OpenAI, co se posílá, uchovávání), sync `--write`/`--check`.
- `docs/admin/AGENTS-ADMIN.md` → ZakazIQ Voice: cesta diktátu, pojistky, API.

## Konec sezení

`web-security-review` na nový vstup. Skill `zakaziq-memory`. Stav VO02 v plánu. Commit
`feat: voice příjem diktátu, přepis a pojistky`.
