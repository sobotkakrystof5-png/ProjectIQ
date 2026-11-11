# AD17 — Ruční překreslení denně používaných obrazovek

## Cíl
Obrazovky, které Kryštof používá denně, vypadají a chovají se jako Dílky — ne jako sjednocené staré UI.

## Než začneš
Rituál začátku. Přečti plán sekci 5 (AD17), `DESIGN.md`, `PRODUCT.md`.
Skilly: `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `frontend-design`, `impeccable`.
Předpoklad: AD07 (tabulka), AD10 (kontakt) a AD14 (asistent) jsou hotové — jinak se obrazovka
kreslí dvakrát.

Obrazovky: `/dashboard` (Dnes) · `/dashboard/[id]` detail zakázky · `/dashboard/calls` ·
`/dashboard/calendar` · `/dashboard/faktury` + detail · `/hub` · `/hub/finance`.

## Kroky
1. **Jedna obrazovka = jeden commit.** Běží to v produkci; neber si víc, než co stihneš ověřit.
2. Na každé obrazovce: `PageHeader` s jedním srozumitelným nadpisem, `Toolbar` s filtry v URL,
   **jedna hlavní akce**, detail v pravém panelu (`detail-sheet.tsx`), užitečný prázdný stav
   (`EmptyState`), skeleton ve tvaru obsahu, plochy ≥ 44 px, nejvýš 2 kliky z Dnes.
3. Z Dílků použij `AccentHeading`, `SectionLabel`, `Money`, `TimeRange`, `LiveDot`, `TileGlyph`.
   Mono (`font-num`) **jen** na časy, data a částky. Žádné emoji, žádné barvy natvrdo,
   žádné gradienty navíc.
4. Kontakt z AD10 dej do záhlaví detailu zakázky a karty kontaktu; asistent z AD14 do panelu.
5. Texty podle `zakaziq-ux-texty-cs` — obyčejná čeština, oslovení vy, žádný žargon.
   U delších textů `humanize-text-cs`.
6. Po každé obrazovce sniž strop v `admin-classes.test.ts`.

## Hotovo, když
- Každá z uvedených obrazovek má `PageHeader`, `Toolbar`, prázdný stav a skeleton.
- Průchod s přihlášením na 390 / 768 / 1280 / 1440 px (ukázková data z AD00).
- Strop zakázaných tříd spadl; `/w` a `/` nezměněné.
- Co jsi neověřil v prohlížeči, je napsané jako neověřené.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD17 v plánu (po obrazovkách), changelog.
Commity `admin/vzhled: <obrazovka>`.
