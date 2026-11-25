# VO10 — Admin stránka ZakazIQ Voice a karta na Dnes (milník 3)

> Sezení pro Claude Code v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`. Jde kdekoli.

## Cíl jednou větou

V adminu `/dashboard/voice` vidím, kolik slov jsem nadiktoval každý den, sérii, rychlost,
ušetřený čas, kategorie, aplikace, heatmapu a kvalitu, schvaluji návrhy učení a spravuji
slovník; na Dnes je karta s dnešními slovy.

## Než začneš

1. Skill `zakaziq-memory` (začátek), `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `dataviz`.
2. Plán `docs/admin/VOICE-PLAN.md` oddíly 8 (definice čísel) a 9 (admin). Stránka s jedinou
   záložkou z VO01.
3. Vzory: `components/admin/card.tsx` (`Card`, `CardHead`, `SECTION_LABEL`), `PageShell`
   a `PageHeader` (`components/ws/app/page-header.tsx`), `PillNav` (`components/ws/app/toolbar.tsx`)
   a jak je admin používá (`?tab=`, např. `components/admin/project-detail-view.tsx`), `components/client-web/web-leads-chart.tsx`
   (graf jako SVG ze serveru), `app/dashboard/page.tsx` (Dnes) a test
   `lib/__tests__/admin-db-rounds.test.ts` (strop kol do databáze), `lib/admin-status.ts` (tóny).
4. Návrh: `podklady/navrh-serveru/queries.ts.txt`, `stats.ts.txt`.
5. Data: na testovacím Neonu jsou diktáty z VO06–VO09, nebo je vyrob skriptem (níž).

## Rozsah

- `lib/admin/voice/stats.ts` — čisté výpočty z plánu oddíl 8 (série, rychlost, ušetřený čas,
  pásma heatmapy, p50/p95), pražské dny přes `lib/prague-time.ts`.
- `lib/admin/voice/queries.ts` — čtení přes `adminDb.batch` (jedno kolo na obrazovku),
  `batchTolerant`, aby stránka bez migrace ukázala prázdný stav místo chyby. Dotazy porovnávají
  okamžiky, ne `AT TIME ZONE` ve WHERE (R-093).
- `GET /api/public/voice/stats?range=` pro okno na Macu — tatáž čísla jako admin.
- Stránka `app/dashboard/voice/page.tsx`, záložky **Přehled · Historie · Učení · Slovník ·
  Nastavení** (Nastavení obsahuje Zařízení z VO01):
  - **Přehled:** řada čísel (Dnes, Týden, Celkem, Rychlost, Série / nejdelší, Ušetřený čas),
    sloupcový graf slov po dnech za 30 dní (dnešek zvýrazněný), heatmapa 26 týdnů, Kategorie,
    Aplikace (8 nejčastějších), Kdy diktujete (hodiny dne), Kvalita (podíl opravených diktátů
    po týdnech, pojistky podle kódu česky, chyby, latence p50/p95), Náklady (den, měsíc, USD).
  - **Historie:** posledních 100 diktátů (čas, aplikace, stav, slova, text zkrácený a celý
    v detailu, který přepis a čištění změnily), hledání v textu, filtr stavu; smazaný text
    po lhůtě = „Text už je smazaný, zůstala čísla".
  - **Učení:** návrhy ke schválení (slovo, blokovaná fráze, pravidlo) s příklady před a po,
    Přijmout / Odmítnout se Zpět, „Naučené samo" s Vrátit, „Spustit učení teď" (s větou, že
    rozbor AI stojí pár korun), datum posledního rozboru.
  - **Slovník:** slova (správný tvar, jak to slyší, použito ×, zdroj), zkratky, pravidla stylu
    (zapnout, vypnout, přidat), blokované fráze (vestavěné jdou vypnout, ne smazat).
  - **Nastavení:** zařízení, styl podle kategorie, rychlost psaní pro ušetřený čas, uchovávat
    text (natrvalo, nebo smazat po N dnech / jen čísla), smazat diktáty (jeden, období, vše, podle hledání — D-V7), učit se samo, čištění, denní strop nákladů.
  - Prázdný stav, když ještě žádný diktát: „Zatím žádný diktát. Podržte fn na Macu a začněte
    mluvit." s odkazem na Nastavení → Zařízení.
- Server actions v `app/voice-actions.ts` (Zod, `Result`, `requireAuth`), stránka
  `requireAdminPage()`.
- **Karta na Dnes:** „Diktování" — dnešní slova, série, odkaz na `/dashboard/voice`. Dotaz
  přidej **do stávající dávky Dnes** (strop v `admin-db-rounds` musí zůstat), bez migrace
  karta nezmizí s chybou, jen se neukáže.
- `scripts/voice-seed.mjs <--smazat> --ano` po vzoru `scripts/ws-seed.mjs`: fiktivní diktáty
  za 60 dní (označené `app_name = 'Ukázka'`), jen na testovací DB, bez `--ano` jen vypíše plán.

## Mimo rozsah

Okno na Macu (VO11). Změny jiných obrazovek adminu kromě karty na Dnes a položky menu.

## Testy

- `stats`: série přes půlnoc a přes změnu času, dnes bez diktátu, rychlost bez `speech_ms`,
  ušetřený čas nikdy záporný, pásma heatmapy, p50/p95.
- `queries` v PGlite s migrací 136: součty za den v pražském čase, kategorie, bez tabulek
  prázdný výsledek.
- `admin-db-rounds`: Dnes pořád v limitu, `/dashboard/voice` jedno kolo.
- Hlídací testy adminu (`components/admin/__tests__/admin-page-guard.test.ts`,
  `admin-classes.test.ts`) a `lib/__tests__/admin-nav.test.ts` projdou.

## Ověření v prohlížeči

`npm run dev`, přihlášený admin, ukázková data ze `voice-seed`: všechny záložky na
390 / 768 / 1280 / 1440 px, žádné vodorovné přetečení, plochy akcí ≥ 44 px, konzole bez chyb,
graf a heatmapa čitelné. Přijmout návrh a Zpět. Dnes s kartou. Pak `voice-seed --smazat`.

## Hotovo, když

- Admin ukazuje slova za den, aktivitu a všechna čísla z plánu oddíl 8; Dnes má kartu.
- Návrhy učení jdou schválit, slovník upravit.
- `tsc`, `npm test`, `build:check` prošly, vzhled ověřený na čtyřech šířkách.
- `docs/admin/AGENTS-ADMIN.md` → ZakazIQ Voice: stránka, čísla, dotazy.

## Konec sezení

Skill `zakaziq-memory` (changelog: milník 3). Stav VO10 v plánu. Commit
`feat: voice admin stránka a karta na Dnes`.
