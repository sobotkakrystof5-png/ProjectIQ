# KP14 — Konzultace z volna v kalendáři

## Cíl
Kryštof v kalendáři ZakazIQ označí časy, kdy má volno pro klienty. Klient si v prostoru vybere jeden z nich, vznikne schůzka s Google Meet a oběma přijde potvrzení. Mimo označené volno si klient nic nezarezervuje (D-K13, R-121).

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 4.1, 4.7, 7 (D-K13), R-005, R-051, R-093, R-096, R-114, R-121, `.claude/security/DECISIONS.md` #020 a #035, `lib/prague-time.ts` (`getHourSlots`), `components/{BookingModal,BookingCTA,SmartCalendar}.tsx`, `app/portal-actions.ts`, `app/calendar-actions.ts`, `lib/admin/{calendar,meetings}.ts`, migrace 001, 008, 044, 105, 115.
Skilly: `zakaziq-workspace-backend`, `web-security-review`, `web-security-memory`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `humanize-text-cs` (e-maily).
**Zadání výslovně povoluje změny v:** kalendáři adminu (`components/SmartCalendar.tsx`, `app/calendar-actions.ts`, `lib/admin/calendar.ts`), `lib/prague-time.ts`, rezervaci na `/p` (`components/Booking*.tsx`, `app/portal-actions.ts`), `lib/admin/meetings.ts`, `lib/portal/`, `app/klient/`.

## Kroky
0. **Zeptej se Kryštofa na zbytek D-K13:** délka konzultace (doporučení 30 min, u volna jde změnit), nejkratší předstih (12 h), do kdy přesunout a zrušit (24 h), kolik budoucích rezervací smí mít klient najednou (2).
1. **Migrace** (první volné číslo, jen připravit): tabulka volna pro klienty (začátek, konec, volitelné týdenní opakování do data, délka konzultace). **Ne `calendar_events`:** guard z 008 a 044 bere každou událost jako obsazený čas, takže by rezervace uvnitř volna kolidovala s ním.
2. **Kalendář adminu.** Volno se kreslí jako plocha pod událostmi, ne jako událost. Založení tažením nebo formulářem „Volno pro klienty", opakování, smazání se „Zpět". Volné časy = volno − události − konzultace − plánované hovory, po délce konzultace, s předstihem.
3. **Rezervace v prostoru.** „Domluvit konzultaci" → den → čas → krátce o čem → potvrdit. Úzká `SECURITY DEFINER` funkce: členství, limit, kolize atomicky v DB (`23P01`/`23505` → česká hláška), založí `consultation_slots`, kalendářní událost a zrcadlo v Hovorech (R-096).
4. **Meet a e-maily.** Po rezervaci schůzka s Google Meet a e-mail klientovi z krystof@vizeon.cz (`lib/admin/meetings.ts`, R-114), Kryštofovi zvonek. Rozhodni s `web-security-review`, jak to spustit bez spojení vlastníka v kódu `/klient`, a zapiš do DECISIONS. Selhání Meetu ani e-mailu rezervaci nezruší.
5. **Klient** vidí své konzultace s odkazem na Meet a do lhůty je přesune nebo zruší (zrušení smaže i událost v Googlu).
6. **`/p/[token]`** čte stejné volno; pevné hodiny `getHourSlots` (všední dny 14–20, víkend 8–22) zmizí.
7. **Asistent (jen pokud zbude čas):** „ve čtvrtek 14–17 mám volno pro klienty" jako vratná akce.
8. **Testy:** rezervace mimo volno odmítnuta; dvě souběžné na stejný čas → jedna projde; klient B vidí cizí rezervaci jen jako obsazený čas; lhůty a limit; migrace dvakrát po sobě.
9. **Paměť.** `web-security-review`, DECISIONS a STATE, changelog, `docs/admin/AGENTS-ADMIN.md` (kalendář), stav KP14 v plánu.

## Hotovo, když
- Kryštof označí volno v kalendáři a klient si v něm zarezervuje konzultaci; mimo volno nic.
- Schůzka má odkaz na Meet v e-mailu klienta i v kalendáři adminu.
- `tsc`, `npm test`, build; kalendář i rezervace ověřené na 390 / 1280 px.

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Commit na požádání, např. `feat: konzultace z volna v kalendáři pro klientský prostor (R-121)`.
