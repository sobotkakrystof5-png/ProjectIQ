# S14 — Peníze: faktury, příjmy, daně

## Cíl
Obrazovka Peníze (přehled, faktury, příjmy a výdaje, odhad daní) za byznys i za celé IČO.
Logika převzatá z admin kódu, ale oddělená a pro více účtů.

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Mockup C3 (rozložení), LP-D (vzhled). Přečti (jen čti) `lib/invoices.ts`, `lib/invoice-ai.ts`,
`lib/tax.ts`, `lib/tax-deadlines.ts`, `lib/tax-constants.ts`, `components/InvoiceRegistry.tsx`.
**Ověř v `memory/memory.md` → Otevřené problémy limit DPH a sazby** — bez ověřených hodnot modul Daně nespouštěj.

## Kroky
1. Zkopíruj potřebnou logiku do `lib/ws/money/` a zobecni na `account_id`/`business_id`.
   Originály neměň. Částky vždy s měnou, CZK a EUR se nikdy nesčítají.
2. **Faktury**: vystavení z hotové zakázky nebo ručně, číselná řada per účet, PDF ve stylu
   Dílků s logem byznysu, odeslání e-mailem (S15), stav zaplaceno/po splatnosti, nahrání
   přijaté faktury s AI přepisem (stejný princip jako admin; klíč jen na serveru).
3. **Příjmy a výdaje**: záznam z faktury, z hotovostní/kartové platby u termínu, ručně;
   kategorie výdajů; graf 6 a 12 měsíců (sloupce rostou), příjmy podle skupin zákazníků,
   služeb a zdroje poptávky (web / objednávací stránka / widget / ručně).
4. **Daně (odhad)**: nastavení režimu (paušální výdaje / skutečné výdaje / paušální daň),
   odhad „kolik si odložit", obrat za 12 měsíců vůči limitu DPH s výhledem, termíny
   s připomínkou. Všude jasně „odhad, ne daňové poradenství".
5. **Přehled měsíce** jako stránka (podklad pro měsíční e-mail v S15).
6. Pohled „Vše · jedno IČO" v přepínači byznysů.
7. Testy: měny se nesčítají, číselná řada bez děr a duplicit při souběhu, odhad daně na
   pevných příkladech.

## Hotovo, když
- Faktura jde vystavit a poslat, příjem se zapíše, graf a odhad sedí na testovacích datech.
- Admin evidence faktur funguje beze změny.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/penize: faktury, příjmy, daně`.
