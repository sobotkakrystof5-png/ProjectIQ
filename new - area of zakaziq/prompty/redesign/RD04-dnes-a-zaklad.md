# RD04 — Dnes, hlavička a společné komponenty

## Cíl
Dnes odpovídá na otázku „Co mám teď udělat?“ jednou hlavní věcí a zbytek dne vedle ní. Vzniknou společné komponenty obrazovek (hlavička, lišta, prázdný stav), které pak používají další sezení.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F3, rozhodnutí D-3), `docs/REDESIGN-HANDOFF.md`, R-057 a `AGENTS.md` B8–B11. Skilly: `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `app/w/[business]/page.tsx`, `components/ws/app/today/*`, `components/ws/app/customer-summary.tsx`,
`components/ws/app/detail-slot.tsx`, `components/ws/brand/*`, `app/w/%5Fdesign/showcase.tsx`, `lib/ws/today.ts`.
Potřebuje D-3 (karta zákazníka do pravého panelu). Není-li rozhodnuté, zeptej se hned.

## Kroky
1. **Hlavní věc nahoře.** Blok „Teď“ vybírá jedno: nejdéle čekající nová poptávka (Potvrdit jedním klikem) → jinak nejbližší dnešní termín → jinak faktura po splatnosti (jen s funkcí Faktury) → jinak užitečný prázdný stav (odkaz na objednání). Pravidlo výběru jako čistá funkce v `lib/ws/today.ts` s testem.
2. **Rozložení.** Příchozí + týdenní kalendář (kalendář zůstává hlavní plochou, R-057). Karta zákazníka se přesune do pravého panelu; `?zakaznik=` zůstane funkční odkaz, který panel otevře. Stav v URL, vše na serveru.
3. **Společné komponenty** v `components/ws/app/`: `PageHeader` (nadpis, podnadpis, jedna hlavní akce, volitelně místo pro „?“ z RD14), `Toolbar` (přepínače pohledu, filtry), sjednocená hustota a rytmus. Prázdné stavy přes `EmptyState`. Doplň do `/w/_design` (jen dev).
4. **Použij je** na Dnes, Poptávky a Zákazníci tak, aby další sezení mohla stejnou hlavičku převzít.
5. **Telefon.** Seznam dne místo týdenní mřížky, hlavní věc nahoře, spodní lišta beze změny, tažení pro obnovení zůstává.
6. **Vzhled a přístupnost.** Dílky, bez barev natvrdo, tmavý režim, `prefers-reduced-motion`, klávesnice, ≥ 44 px.
7. Uprav testy (`ws-today`, `ws-app-shell`), přidej test výběru hlavní věci.

## Hotovo, když
- Na Dnes je vidět jedna hlavní věc a ta se dá splnit jedním klikem.
- Karta zákazníka se otevře v panelu, `?zakaznik=` odkazy fungují.
- Hlavička a lišta jsou společné komponenty, ověřeno na 390 / 768 / 1280 / 1440 px, světlý i tmavý režim.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD04 v plánu. Commit `ws/dnes: hlavní věc, společné komponenty obrazovek`.
