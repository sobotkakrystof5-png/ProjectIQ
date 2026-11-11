# AD07 — Sdílená tabulka a výpisy

## Cíl
Jedna tabulka s řazením, filtry a stránkováním v URL místo pěti ručně psaných bez řazení.

## Než začneš
Rituál začátku. Přečti plán sekci 5 (AD07). Skilly: `zakaziq-design-dilky`, `zakaziq-workspace-backend`.
Soubory: `components/{LeadsTable,CostsManager,CompletedProjectsTable,WaitlistSection,InvoiceRegistry,InvoiceArchive,DashboardFilters}.tsx`,
`app/{calls,costs,completed}-actions.ts`, `app/hub/finance/invoice-actions.ts`,
`components/ws/app/{page-header,toolbar}.tsx`, `components/ws/brand/empty-state.tsx`, `components/ui/*`.

Dnešní stav: řazení nemá ani jedna tabulka, stránkování ani jedna, mobilní variantu jen
`WaitlistSection`. Pět dotazů táhne celou tabulku bez `LIMIT`.

## Kroky
1. **Nový `components/admin/data-table.tsx`** — serverová komponenta, stav v URL, takže řazení
   i stránky jsou obyčejné `<Link>` (funguje tlačítko Zpět, nic se nehydratuje). Rozhraní:
   `AdminColumn<T> = { key, header, sortable?, align?, cell, mobile?: 'title'|'meta'|'badge'|'hidden' }`,
   `AdminTableProps<T> = { rows, columns, rowKey, href?, sort, page, empty, toolbar?, footer?, selection? }`.
   Mobil: stejná komponenta, `<table>` od `sm:`, pod tím karty podle rolí `mobile`.
2. **Nový `lib/admin-table.ts`**: `parseTableParams(searchParams, { allowed, default, pageSize })`
   → validované `{ sortKey, dir, limit, offset }` + whitelist `sortKey → SQL fragment`.
   **Uživatelský vstup se nikdy neinterpoluje do `ORDER BY`.** Řazení a stránkování serverově.
3. **Převod v tomto pořadí:** `CompletedProjectsTable` (jen čtení, 11 sloupců) → `InvoiceRegistry`
   (filtry a součty z prohlížeče do SQL) → `CostsManager` → `WaitlistSection` → grid výpisy
   (`/dashboard/klienti`, `/dashboard/pozadavky`, `/alteno`, `InvoiceArchive`) → **`LeadsTable` naposled**
   (1181 ř., dvě tabulky, inline úpravy, potřebuje `selection` a `useOptimistic` z AD08).
   **Nepřeváděj:** `ProjectCalculator` (formulář v tabulce), `HodnoceniDashboard`, `NotificationList`.
4. **Dotazy.** `LIMIT` a stránkování k `getLeads`, `getCosts`, `getCompletedProjects`, `getSurveys`.
   **`getAllLeadNotes` zruš** — posílá do prohlížeče všechny poznámky všech leadů; nahraď
   `LEFT JOIN LATERAL (… ORDER BY created_at DESC LIMIT 3)` na náhled a plné poznámky až v panelu detailu.
5. `components/DashboardFilters.tsx` (48 ř., staré třídy) nahraď `Toolbar` + `PillNav`.
   Staré adresy filtrů přesměruj, aby uložené odkazy fungovaly.
6. Sniž stropy v `admin-classes.test.ts`.

## Hotovo, když
- Pět tabulek a čtyři grid výpisy mají řazení kliknutím do hlavičky, stránkování a užitečný prázdný stav.
- `?sort=&dir=&page=` přežije reload i tlačítko Zpět.
- Žádný dotaz výpisu není bez `LIMIT`; test, že neznámý `sort` spadne na výchozí a nedostane se do SQL.
- Mobilní karty na 390 px u všech převedených výpisů.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD07 v plánu, changelog.
Commit `admin/tabulky: sdílená tabulka s řazením a stránkováním`.
