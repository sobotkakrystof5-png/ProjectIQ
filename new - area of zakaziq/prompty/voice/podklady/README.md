# Podklady pro sezení ZakazIQ Voice

## `navrh-serveru/` — neověřený návrh

Serverová část napsaná v cloudovém sezení 2026-11-25 před tím, než vznikl tenhle plán:
migrace 138, `lib/admin/voice/*` a `app/api/public/voice/*`. Prošla jen `npx tsc --noEmit`
v kopii repa, **nemá jediný test a nikdy neběžela**.

- Soubory mají příponu `.txt`, aby je nekontroloval `tsc` ani nezahrnul build. Do repa se
  kopírují s původním názvem na místo podle plánu, až v sezení, které je potřebuje.
- Kde se návrh liší od plánu (`docs/admin/VOICE-PLAN.md`), **platí plán**.
- **Ceny v návrhu jsou odhad**, nepřebírat: `HAIKU_PRICE` v `cleanup.ts.txt` a tabulka cen
  přepisu v `stt.ts.txt`. Skutečné ceny ověří VO00 a patří do `lib/admin/voice/costs.ts`.
- **Změny po VO00 (R-150), které návrh ještě nezná:** text diktátů zůstává natrvalo (`text_retention_days` výchozí NULL, žádné mazání `voice_corrections` po 365 dnech ani návrhů — v `store.ts.txt` úklid upravit), pojistka **G12** (ozvěna nápovědy) a nápověda pro Groq nejvýš 224 tokenů.
- Co v návrhu chybí oproti plánu: kontrola `Origin` (403), kontrola prvních bajtů zvuku,
  `store_text` a `daily_cost_cap_usd`, `/stats`, úklid jako samostatný modul, admin stránka,
  karta na Dnes, zlatá sada a všechny testy.

| Soubor | Sezení | Cíl v repu |
|---|---|---|
| `138_zakaziq_voice.sql.txt` | VO01 | `migrations/138_zakaziq_voice.sql` |
| `keys.ts.txt`, `store.ts.txt` (zařízení) | VO01 | `lib/admin/voice/` |
| `text`, `stt`, `guards`, `dictionary`, `categories`, `pipeline`, `http`, `store` | VO02 | `lib/admin/voice/` |
| `dictate.route.ts.txt`, `config.route.ts.txt` | VO02 | `app/api/public/voice/{dictate,config}/route.ts` |
| `cleanup.ts.txt`, část `guards` (`checkCleanup`) | VO07 | `lib/admin/voice/` |
| `learn`, `learner`, `feedback/terms/settings.route` | VO08 | `lib/admin/voice/`, `app/api/public/voice/…` |
| `queries.ts.txt`, `stats.ts.txt` | VO10 | `lib/admin/voice/` |

## `lista-nahled.html`

Náhled stavů lišty (klid, najetí, poslouchá, bez držení, zpracovává, chyba) v barvách Dílků
pro VO05. Otevři v prohlížeči. Je to předloha velikostí a barev, ne kód pro aplikaci.
