# RD05 — Kalendář

## Cíl
Kalendář Workspace je přehledný, rychle se v něm zakládají a přesouvají termíny a pomáhá najít volný čas. (Admin SmartCalendar se nemění.)

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F4), R-044, R-054, R-057 a `AGENTS.md` B9 (S10, S13). Skilly: `zakaziq-design-dilky`, `zakaziq-workspace-backend`, `zakaziq-ux-texty-cs`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `app/w/[business]/kalendar/page.tsx`, `components/ws/app/calendar/{time-grid,month-grid,agenda}.tsx`,
`lib/ws/{calendar,calendar-layout,bookings,hours}.ts`, `lib/ws/intake/slots.ts` (výpočet volných časů, **znovu použij, nekopíruj**), `components/ws/app/booking/*`, `components/ws/app/detail-slot.tsx`.

## Kroky
1. **Lišta.** Jedna kompaktní řada: Den / Týden / Měsíc, šipky, Dnes, + Rezervace (společné `PageHeader`/`Toolbar` z RD04). Blokace přesunout do „+ Rezervace“ nebo do menu u tlačítka.
2. **Rychlé zadání.** Klik nebo tažení v mřížce otevře malé okno: zákazník (hledání), služba, čas, pracovník. Úplný formulář zůstane pod „Další údaje“. Využij `booking-form.tsx`, ne druhou kopii.
3. **Chytré návrhy.** Při potvrzení poptávky a v rychlém zadání ukaž tři nejbližší volné časy (stejné pravidlo jako objednávka, `computeSlots`) a upozornění na kolizi. „Najdi volný čas pro službu“ jako akce v ⌘K i v mřížce.
4. **Přehlednost.** Barva podle pracovníka (`ws.staff.color`) nebo služby, zvýrazněné mezery a pauzy mimo otevírací dobu, mini‑měsíc pro skok na datum, zachovaný pruh Příchozí z R-057.
5. **Tažení.** Změna délky tažením za spodní okraj (server action, kolize `23P01` → česká hláška, „Zpět“). Přesun s optimistickou změnou. Klávesnicová alternativa zůstává (Přesunout v detailu).
6. **Telefon.** Den jako seznam, přejetí mezi dny, velké plochy.
7. **Výkon.** Při tažení neobnovuj celý týden; optimistická změna a potvrzení ze serveru.
8. Testy v `ws-bookings.test.ts` (návrhy časů, změna délky, kolize) a `ws-calendar-layout`.

## Hotovo, když
- Rezervace se založí z mřížky na dva kliky bez celého formuláře.
- Při potvrzení poptávky vidíš tři volné časy a konflikt hned.
- Všechno projde na počítači i telefonu, světlý i tmavý režim; testy, `tsc`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD05 v plánu. Commit `ws/kalendar: rychlé zadání, návrhy časů, přehlednost`.
