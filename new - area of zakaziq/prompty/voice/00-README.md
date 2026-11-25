# Prompty pro Claude Code — ZakazIQ Voice

Třináct sezení (VO00–VO12). **Jedno sezení = jedna nová konverzace v Claude Code** v kořeni repa
ZakazIQ, na větvi `admin/zakaziq-voice` (vznikne ve VO00 z `main`). Každé sezení začíná
přečtením paměti a končí jejím zápisem, takže na sebe navazují i bez kontextu z minula.
Zdroj pravdy je plán `docs/admin/VOICE-PLAN.md` (rozhodnutí v oddílu 2, stav v oddílu 14).

## Jak spustit sezení

1. Otevři Claude Code v repu ZakazIQ, nová konverzace (`/clear`).
2. Zkopíruj celý obsah souboru `VOxx-….md` jako první zprávu.
3. Na otázky odpovídej hned, Claude je klade jen tam, kde by odhad stál za přepracování.
4. Na konci zkontroluj body „Hotovo, když", že je zapsaná paměť (`memory/memory.md`)
   a stav v plánu (oddíl 14).
5. Teprve pak další sezení.

Kdyby sezení nestihlo vše: napiš „ukonči sezení podle zakaziq-memory" a v novém sezení dej
stejný prompt znovu. Pokračuje podle `memory/memory.md` a tabulky v plánu.

**Sezení označená „Mac" musí běžet v Claude Code na MacBooku** (potřebují `swift`, mikrofon
a oprávnění systému). Ostatní jdou kdekoli.

## Pořadí a závislosti

| # | Sezení | Kde | Hlavní skilly | Potřebuje |
|---|---|---|---|---|
| VO00 | Příprava: plán do repa, větev, R-148, ceny, test přepisu češtiny | Mac | zakaziq-memory | — |
| VO01 | Databáze (migrace 136) a klíč zařízení | kdekoli | zakaziq-workspace-backend, web-security-review | VO00 |
| VO02 | Příjem diktátu: přepis, pojistky, slovník, API | kdekoli | zakaziq-workspace-backend, web-security-memory | VO01 |
| VO03 | Mac: kostra aplikace, značka, oprávnění, připojení | Mac | zakaziq-design-dilky, zakaziq-ux-texty-cs | VO01 |
| VO04 | Mac: Fn a nahrávání | Mac | — | VO03 |
| VO05 | Mac: lišta s mřížkou dílků | Mac | zakaziq-design-dilky | VO04 |
| VO06 | Mac: odeslání, vložení, historie, fronta (**milník 1**) | Mac | zakaziq-ux-texty-cs | VO02, VO05 |
| VO07 | Čištění textu a kontrola proti halucinacím (**milník 2**) | kdekoli | zakaziq-workspace-backend | VO02 |
| VO08 | Učení z logů | kdekoli | zakaziq-workspace-backend, web-security-review | VO07 |
| VO09 | Mac: zachycení oprav po vložení | Mac | — | VO06, VO08 |
| VO10 | Admin stránka a karta na Dnes (**milník 3**) | kdekoli | zakaziq-design-dilky, zakaziq-ux-texty-cs, dataviz | VO02 |
| VO11 | Mac: okno jako Wispr Flow | Mac | zakaziq-design-dilky, zakaziq-ux-texty-cs | VO06, VO08, VO10 |
| VO12 | Nasazení, ostrý týden, ladění (**milník 4**) | Mac | web-security-review, web-security-audit | vše |

**Nejkratší cesta k „diktuji Fn":** VO00 → VO01 → VO02 → VO03 → VO04 → VO06 (lišta prostá,
VO05 se doplní potom).
**Souběžně jdou:** VO07 a VO10 hned po VO02, nezávisle na Mac sezeních.
**Minimum, aby to mělo smysl:** VO00–VO07 a VO10.

## Společná pravidla (platí v každém sezení)

- Česky, stručně. Na začátku řekni záměr, na konci výsledek, skutečné ověření a co zbývá.
- **Tohle je výslovné zadání změny adminu** (R-148 z VO00). Mění se jen to, co sezení
  jmenuje; stávající obrazovky adminu, Workspace, landing a klientský prostor beze změny.
- Větev `admin/zakaziq-voice`. **Commit na téhle větvi po uceleném kroku Kryštof povoluje
  tímto promptem**, zpráva česky `feat: voice …` / `fix: voice …` / `docs: voice …`.
  Push, merge do `main` a deploy jen s výslovným souhlasem v konverzaci.
- Stageuj jen konkrétní soubory, nikdy `git add -A`. Cizí neuložené změny nepřepisuj,
  nevracej ani nestaguj.
- **Migrace jen připravit**; na testovací Neon jen se souhlasem, na produkci až ve VO12.
  Číslo si vždy ověř proti `ls migrations` (plán počítá s 136). Idempotentní, aditivní,
  test v PGlite dvakrát po sobě.
- **Žádný nový npm balíček.** Groq se volá přes `fetch`. Aplikace na Macu bez cizích balíčků
  (jen Apple frameworky a systémové `sqlite3`).
- Názvy modelů Claude jen v `lib/ai/models.ts` (role `fast`, `smart`). Ceny na jednom místě.
- `.env.local` nikdy nečti nahlas, nevypisuj ani necommituj. Klíče (Groq, klíč zařízení)
  vkládá Kryštof sám; agent je nevidí a nepíše do chatu.
- Jen Dílky. Texty podle `zakaziq-ux-texty-cs`. Žádné vymyšlené údaje ani čísla.
- Každá stránka adminu `requireAdminPage()`; čtení přes `adminDb`; veřejné vstupy Zod,
  limity těla, limit požadavků. Text diktátu se nikdy nevykresluje jako HTML a nepíše do logu.
- Po sezení: `npx tsc --noEmit`, `npm test`, `npm run build:check` (při běžícím dev);
  u Mac sezení `make -C voice-mac test build`. Co jsi neověřil (v prohlížeči, na Macu,
  s přihlášením, naostro), napiš. Neoznačuj neověřené za hotové.
- Bezpečnostní změna = zápis do `.claude/security/` ve stejném commitu, pak
  `node scripts/sync-agent-context.mjs --write` a `--check`.
- Technická fakta do `docs/admin/AGENTS-ADMIN.md` → oddíl „ZakazIQ Voice", nová env do
  `.env.example` a `docs/AGENTS-REFERENCE.md` → A, nový dokument do `memory/index.md`.

## Skilly

- `zakaziq-memory` — začátek a konec každého sezení.
- `zakaziq-workspace-backend` — vzory dotazů, migrací, route handlerů a klíčů (admin je ve
  schématu `public`, ale vzory platí).
- `zakaziq-design-dilky` — lišta, okno na Macu, admin stránka.
- `zakaziq-ux-texty-cs` — každý text, který Kryštof uvidí.
- `dataviz` — grafy v adminu a v okně na Macu.
- `web-security-review` před commitem veřejného vstupu, `web-security-memory` při zápisu,
  `web-security-audit` po nasazení.

## Podklady

`podklady/` (tady vedle) obsahuje:

- `navrh-serveru/` — návrh serverového kódu z jiného sezení (migrace a `lib/admin/voice/*`,
  `app/api/public/voice/*`). **Neověřený, bez testů**, soubory mají příponu `.txt`, aby je
  nekontroloval `tsc`. VO01, VO02, VO07 a VO08 z něj můžou vyjít; kde se liší od plánu, platí plán.
- `lista-nahled.html` — náhled stavů lišty v barvách Dílků pro VO05.
