# AD06 — Rychlost I: dávkování, indexy, streaming

## Cíl
Navigace dělá jednotky dotazů místo desítek a kostra obrazovky je vidět hned.

## Než začneš
Rituál začátku. Přečti plán sekce 5 (AD06), 7 a 11 (výchozí měření z AD00), `AGENTS.md` → B3.
Skill: `zakaziq-workspace-backend`.
Soubory: `lib/db.ts`, `lib/ws/db.ts` (vzor), `lib/admin-counts.ts`,
`components/admin/project-detail-view.tsx`, `app/dashboard/{calendar,calls,faktury,klienti}/page.tsx`,
`app/hub/finance/page.tsx`, `lib/ws/admin/clients.ts`, `app/providers.tsx`, `next.config.mjs`.

## Kroky
1. **Dávkovaný ovladač.** Nový `lib/admin/db.ts` podle `lib/ws/db.ts`:
   `neon(DATABASE_URL, { fetchOptions: { cache: 'no-store' } })`, tag `q`, `adminDb.batch(queries)`
   = transakce jedním požadavkem, `setAdminDriverForTests` pro PGlite. `lib/db.ts` **nech** kvůli
   ~100 existujícím call sites; nové a přepisované čtení jde přes `adminDb`. Admin tabulky jsou
   v `public` bez RLS, `set_config` není potřeba.
2. **Vodopády na dávky.** `components/admin/project-detail-view.tsx` má 12 dotazů v 5 sekvenčních
   vlnách (:72 → :83 → :335 → :347 → :430 → :432) a pět `SELECT *` bez `LIMIT` — sluč do 1–2 dávek,
   vybírej jen potřebné sloupce, doplň `LIMIT`. Stejně `/dashboard/calendar` (7), `/dashboard/calls` (5),
   `/dashboard/faktury` (korelovaný `COUNT(*)` na každou fakturu → jeden `GROUP BY`),
   `/hub/finance` (12 ve 3 vlnách), `lib/admin-counts.ts`, a layout (session + counts paralelně).
3. **`/dashboard/klienti`.** 11 korelovaných podvýběrů na až 500 účtů a `ORDER BY GREATEST(5 podvýběrů)`
   → `LEFT JOIN LATERAL (… LIMIT 1)` + `LIMIT 50` + stránkování. Neporušuj omezení z R-063/DECISIONS #017
   (admin nečte osobní ani finanční obsah zákazníků klientů).
4. **Migrace 100 — indexy a `pg_trgm`.** Jen připravit, aplikuje Kryštof. Obsah v plánu (AD06).
   Ověř `EXPLAIN` v PGlite před a po; poměr zapiš, absolutní čísla označ jako WASM.
5. **Streaming.** `loadAdminCounts()` jako promise + `use()` v `<Suspense>`, `loading.tsx` se skeletony
   ve tvaru obrazovky pro `/dashboard`, `/alteno`, `/hub`.
6. **Cache navigace.** `next.config.mjs`: `experimental.staleTimes: { dynamic: 30, static: 180 }`.
7. **`SessionProvider` jen pro admin.** Dnes `app/providers.tsx` obaluje celou aplikaci včetně `/w`
   a landing page → prohlížeč volá `/api/auth/session` po každém mountu. Nový `AdminProviders`
   s předanou session do layoutů adminu; projdi všechny `useSession()`.

## Hotovo, když
- Čítač ukazuje **≤ 2 kola do DB** na navigaci u Dnes, detailu zakázky, kalendáře a faktur.
- Migrace 100 je připravená (aplikována: ne) a `EXPLAIN` ukazuje index scan u dosud neindexovaných řazení.
- Každá hlavní obrazovka má `loading.tsx`; landing page už nenačítá NextAuth.
- Čísla před/po jsou v plánu, sekce 11. Testy, `tsc`, `build:check` zelené.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD06 v plánu, migrace v changelogu s „aplikována: ne“.
Commit `admin/rychlost: dávkované dotazy, indexy, streaming`.
