# AD05 — Kostra, šířky, Hub a jeden systém odznaků

## Cíl
Jedna kostra pro `/dashboard`, `/alteno` i `/hub`, konec jediné pevné šířky a jeden barevný systém stavů.

## Než začneš
Rituál začátku. Přečti plán sekci 5 (AD05) a `docs/admin/AGENTS-ADMIN.md` → Kostra administrace.
Skilly: `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Soubory: `components/admin/{admin-shell,admin-nav,admin-search}.tsx`, `lib/admin-nav.ts`,
`app/hub/layout.tsx`, `components/HubSidebarNav.tsx`, `lib/types.ts` (`STATUS_STYLES`,
`LEAD_STATUS_STYLES`), `components/StatusBadge.tsx`, `components/LeadsTable.tsx` (`ACTION_TYPE_STYLES`),
`components/ws/app/{page-header,toolbar}.tsx`, `components/ws/brand/*`.

## Kroky
1. **Šířky.** Z `<main>` v `AdminShell` zmizí `max-w-5xl` (dnes mačká 11sloupcový
   `CompletedProjectsTable`). Šířku volí stránka přes `PageShell`; přidej do něj `width: 'table'`
   = `max-w-[1600px]`. Pozor na dvojité okraje (`PageShell` má vlastní `px`/`py`).
2. **Hlavička a filtry.** Zpřístupni adminu `components/ws/app/{page-header,toolbar,skeletons,detail-sheet,nav-icon,help-link}.tsx`
   (ověřeno: závisí jen na `AccentHeading` a `cn`, žádná data Workspace). Nasaď `PageHeader`
   na obrazovky, které dnes mají vlastní `<h1>`.
3. **Hub do kostry.** `app/hub/layout.tsx` zruš a nahraď `AdminShell` (dnes vlastní panel `lg:w-56`,
   `brand-gradient`, inline `style={{height:'56px'}}`, bez `data-app` → tokeny tam vůbec neplatí).
   `components/HubSidebarNav.tsx`: pět duhových barev pilířů → jeden akcent + `TileGlyph` / `SectionLabel`.
   Hub přidej do `lib/admin-nav.ts` jako sekci. Staré adresy musí dál fungovat.
4. **Jeden systém odznaků.** Nový `lib/admin-status.ts`: 17 kombinací ze `STATUS_STYLES` (5),
   `LEAD_STATUS_STYLES` (6) a `ACTION_TYPE_STYLES` (6) → pět tónů `neutral | info | signal | success | danger`
   nad `components/ui/badge.tsx`. Projdi i `lib/types.ts`.
5. Sniž stropy v `admin-classes.test.ts` o to, co jsi uklidil.

## Hotovo, když
- `/hub` má stejný panel, hledání ⌘K a spodní lištu jako `/dashboard`; `app/hub/layout.tsx` neexistuje.
- Žádná obrazovka nemá vlastní definici barvy odznaku.
- Tabulka s 11 sloupci se vejde bez vodorovného posuvníku na 1440 px.
- Vzhled ověřen na 390 / 768 / 1280 / 1440 px; `/w` a `/` nezměněné.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD05 v plánu, nové stropy, changelog.
Commit `admin/kostra: jedna kostra pro dashboard, alteno a hub`.
