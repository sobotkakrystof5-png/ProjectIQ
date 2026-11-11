# AD08 — Rychlost II: e-maily mimo akci, kalendář, bundle, optimistika

## Cíl
Akce odpovídají hned a těžké obrazovky se nenačítají dřív, než je potřeba.

## Než začneš
Rituál začátku. Přečti plán sekce 5 (AD08) a 7. Skill: `zakaziq-workspace-backend`.
Soubory: `app/actions.ts`, `app/calls-actions.ts`, `lib/email.ts`, `app/dashboard/calendar/page.tsx`,
`components/SmartCalendar.tsx`, `app/hub/finance/page.tsx`, `lib/recurring-transactions.ts`,
`app/api/invoices/[id]/pdf/route.ts`, `components/LeadsTable.tsx`, `vercel.json`,
`lib/ws/__tests__/ws-bundle-guard.test.ts` (vzor).

## Kroky
1. **E-maily mimo akci.** Dnes `app/actions.ts:237` awaituje Gmail SMTP **uprostřed `updateProject`**,
   před zápisy do financí a před `revalidatePath` (totéž :154, :387, :404, :502,
   `calls-actions.ts:209,227`). Přepiš na `after()` z `next/server` (Next 16.4.2 ho má).
   **Frontu pro admin nestavěj** — `lib/ws/email/outbox.ts` je per účet.
   Projdi každé místo zvlášť: `after()` mění pořadí vedlejších efektů.
2. **Časové okno v kalendáři.** Všechny 4 dotazy `/dashboard/calendar` dostanou
   `starts_at >= $from AND starts_at < $to` (zobrazený měsíc ± týden); filtrování měsíce v JS
   v `SmartCalendar` zruš. Dnes jde do prohlížeče celá historie `calendar_events` i `consultation_slots`.
3. **`/hub/finance` přestane zapisovat při čtení.** Dva generátory opakovaných transakcí
   (`lib/recurring-transactions.ts`) z renderu do nového cronu `/api/cron/admin-denne`
   (`vercel.json`, 1× denně — Hobby víc nedovolí, R-006) + tlačítko „Vygenerovat opakované“.
   Je to i oprava správnosti: GET nesmí zapisovat, reload dnes může zdvojit.
4. **Bundle.** `next/dynamic` (dnes v adminu 0×) na `SmartCalendar` (1166 ř. + framer-motion),
   `BookingModal` (539 + rhf + zod + fm), `StartupProjectEditor` (978), `TradingViewChart`,
   `AiAssistantModal`, `PerformanceOverview`. `framer-motion` staticky v 6 souborech → `LazyMotion` + `m`.
   Nový `components/admin/__tests__/admin-bundle-guard.test.ts` podle Workspace.
5. **Optimistika.** `useOptimistic` (v repu 0×) na potvrzení leadu, „Zaplaceno“ a změnu stavu zakázky,
   s vrácením při kolizi. Zároveň oprav, že akce z `LeadsTable` revaliduje `/dashboard/calls`
   a tím zahodí svůj vlastní lokální update — revaliduj jen zasaženou cestu.
6. **PDF route.** `app/api/invoices/[id]/pdf/route.ts` dnes nemá `runtime` ani `maxDuration` a staví
   až 5 MB přes base64 do `Buffer`. Doplň `runtime = 'nodejs'`, `maxDuration`, streamuj `bytea`,
   přidej `ETag` + `Cache-Control: private, must-revalidate`. `X-Frame-Options: SAMEORIGIN`
   na téhle cestě **neměň** (`.claude/security/STATE.md` → Neměnit bez zeptání).

## Hotovo, když
- Test, že `sendEmail` běží v `after` a uložení zakázky na SMTP nečeká.
- Kalendář načte ≤ 60 řádků; `/hub/finance` v GET nezapisuje (test).
- `admin-bundle-guard` drží strop; čísla v plánu, sekce 11.
- Potvrzení leadu a „Zaplaceno“ vypadají okamžitě a při kolizi se vrátí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD08 v plánu, nový cron do `AGENTS-ADMIN.md` a changelogu.
Commit `admin/rychlost: e-maily mimo akci, časové okno kalendáře, lehčí balíček`.
