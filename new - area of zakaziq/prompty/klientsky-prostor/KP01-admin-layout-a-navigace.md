# KP01 — Nový admin: společný layout a navigace

## Cíl
Admin má jednu čistou kostru ve stylu Dílky místo 13 odkazů v horní liště a tří vzhledů. Funkce zůstávají, mění se rozložení, navigace a vzhled. Staré stránky fungují dál a přebírají nový vzhled postupně.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` sekce 4.6 a 8, `docs/admin/AGENTS-ADMIN.md` (celé), `DESIGN.md`, `PRODUCT.md`, R-021, R-027, R-040, R-067 a `docs/AGENTS-REFERENCE.md` B8–B9.
Skilly: `zakaziq-design-dilky`, `impeccable`, `design-taste-frontend`, `zakaziq-ux-texty-cs`.
**Zadání výslovně povoluje změny v:** `app/dashboard/layout.tsx`, `app/alteno/layout.tsx`, `app/hub/layout.tsx`, `components/MobileNav.tsx`, `components/HubSidebarNav.tsx` a v nových souborech kostry. Ostatní stránky adminu jen přepoj na novou kostru, jejich logiku neměň.
Potřebuje D-K6 (rozsah redesignu).

## Kroky
1. **Průzkum.** Spočítej odkazy a stránky v současných třech layoutech, zapiš mapu stará cesta → nová skupina. Prověř, co v kostře Workspace (`components/ws/app/`: `PageShell`, `PageHeader`, `Toolbar`, `PillNav`, `EmptyState`, hledání ⌘K, pravý panel) jde použít přímo a co je třeba zobecnit.
2. **Rozhodnutí o vzhledu.** Tokeny Dílků jsou jen v `[data-app="ws"]` (R-027). Navrhni a zapiš nové rozhodnutí: admin dostane vlastní kořen `data-app` se stejnými tokeny, aby se Workspace a admin nemíchaly, a staré třídy `brand-*` zůstanou funkční na nepřepnutých stránkách. Počkej na souhlas Kryštofa.
3. **Kostra.** Nový společný layout: boční menu na počítači (skupiny Dnes · Zakázky · Kalendář a Hovory · Peníze · Klienti · Hub podle plánu 4.6), spodní lišta a šuplík na telefonu, přepínač VIZEON/ALTENO u Zakázek, zvonek s počtem, profil. Počty (požadavky, poptávky, oznámení) z jednoho dotazu v layoutu.
4. **Hledání ⌘K.** Zakázky, klienti, faktury, hovory podle názvu; první verze jen přechod na stránku. Bez AI.
5. **Přepnutí stránek.** Všechny stávající stránky adminu se zobrazí v nové kostře beze změny logiky. Starý horní pruh zmizí. Žádná adresa se nemění; ALTENO a Hub dál fungují, jen v nové kostře.
6. **Texty a stavy.** Názvy položek obyčejně česky, prázdné stavy užitečné, plochy ≥ 44 px, klávesnice a focus. Žádné emoji ani barvy natvrdo.
7. **Testy.** Test, že každá dřívější položka menu má v nové navigaci své místo (seznam cest); test počtů s mockovaným `sql`.
8. **Paměť.** Nové rozhodnutí R-0xx (admin na Dílky, nahrazuje R-027), changelog, aktualizace `docs/admin/AGENTS-ADMIN.md` (struktura, UX pravidla) a `memory/index.md`.

## Hotovo, když
- Z jedné navigace se dostaneš na každou dosavadní stránku adminu, na telefonu i na počítači.
- Žádná stará adresa nevrací 404; `/login`, `/dashboard`, `/alteno`, `/hub`, `/p/[token]` ověřené (regrese s přihlášením na testovací DB, co nejde ověřit, napiš).
- Vzhled ověřen na 390 / 768 / 1280 / 1440 px, světlý režim (tmavý jen pokud admin má).
- `tsc`, `npm test`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav KP01 v plánu. Commit na požádání, např. `ws/admin: nová kostra a navigace`.
