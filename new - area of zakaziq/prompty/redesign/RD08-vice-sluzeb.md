# RD08 — Více služeb v jedné rezervaci a vlastní rezervace

## Cíl
Zákazník i majitel objednají víc služeb najednou jako jeden souvislý blok a majitel rezervuje z kalendáře, z karty zákazníka i z ⌘K bez zbytečného formuláře.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F5), R-005, R-035, R-044, R-045, `docs/workspace/SETUP.md` a `AGENTS.md` B3, B6. Skilly: `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `migrations/068_ws_poptavky_zakazky_terminy.sql`, `lib/ws/bookings.ts`, `lib/ws/intake/*`,
`components/ws/order/order-flow.tsx`, `components/ws/app/booking/*`, `lib/ws/__tests__/helpers/ws-pglite.ts` (`seedAccount`), `lib/ws/gdpr.ts`.
Potřebuje D-5 (opakované rezervace: ano/ne). Bez rozhodnutí opakování nedělej.

## Kroky
1. **Návrh dat (nejdřív ukaž Kryštofovi).** Migrace 090 (088 používá RD10, 089 RD16): `ws.appointments.group_id uuid` (společné potvrzení, zrušení a přesun skupiny), `ws.request_services (account_id, business_id, request_id, service_id, position)` se složenými cizími klíči, RLS (`ws.enable_account_rls`), touch trigger. Idempotentní, spustitelná dvakrát. Aktualizuj `seedAccount()`, zkontroluj dopad na `ws.erase_customer` (GDPR) a export. **Jen připrav, aplikuje Kryštof.**
2. **Pravidlo.** V1: jeden pracovník na celý blok, služby jdou těsně za sebou, délka = součet. `EXCLUDE` na pracovníka zůstává a hlídá kolize (jedna kolize vrátí celou skupinu zpět v jedné transakci/CTE).
3. **Příjem.** API v1 a objednávka: volitelné `serviceIds` (pole, nejvýš 5) vedle `serviceId`, schema se rozšiřuje jen přidáním. Volné časy se počítají z celkové délky. `order-flow.tsx`: výběr více služeb s mezisoučtem času a ceny.
4. **Potvrzení.** Potvrzení poptávky vytvoří N navazujících termínů se stejným `group_id`. Kalendář je ukazuje jako **jeden blok** s podpoložkami; zrušení a přesun platí pro celou skupinu (se „Zpět“).
5. **Vlastní rezervace.** Rychlé zadání z RD05 umí víc služeb. Na kartě zákazníka „Objednat znovu“ (předvyplní naposledy použité služby). ⌘K příkaz „rezervace …“ beze změny. Opakování („každé 4 týdny“) **jen** když ho D-5 schválí.
6. **Zákazník a e-maily.** Jeden e-mail se seznamem služeb, portál `/z` ukáže služby bloku, .ics je jedna událost.
7. **Testy v PGlite:** kolize druhé služby vrátí celou skupinu, migrace dvakrát po sobě, oddělení účtů, GDPR výmaz zákazníka.
8. **Dokumentace:** `docs/workspace/API.md`, `docs/AGENTS-REFERENCE.md` B3 (tabulky), `docs/workspace/SETUP.md` (pořadí migrací), `web-security-review`.

## Hotovo, když
- Zákazník vybere dvě služby a vznikne jeden souvislý blok; kolize nic neuloží.
- Majitel rezervuje víc služeb z kalendáře i z karty zákazníka.
- Migrace je připravená (aplikována: ne), testy, `tsc`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace a její stav do changelogu a katalogu tabulek). Stav RD08 v plánu. Commit `ws/rezervace: více služeb v jedné rezervaci`.
