# RD13 — Nastavení: pět sekcí, funkce podle oboru

## Cíl
Nastavení je stručné a nikoho nezahlcuje: pět sekcí místo deseti podstránek, funkce se zapínají podle oboru, formuláře se ukládají samy a nový klient začne do tří minut.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F9), R-043, R-054 a `AGENTS.md` B9 (S13). Skilly: `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `zakaziq-workspace-backend`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `app/w/[business]/nastaveni/*`, `components/ws/settings/*`, `lib/ws/settings.ts`,
`lib/ws/templates/` (výchozí funkce oborů), `lib/ws/features.ts`, `components/ws/app/today/welcome.tsx`, `app/w/ucet/*`. Vstup je z Účtu (RD01).

## Kroky
1. **Pět sekcí.** Rozcestník `/w/[byznys]/nastaveni` má pět karet: **Firma** (profil dodavatele z RD10, vzhled) · **Nabídka** (služby, otevírací doba, pracovníci) · **Objednávky** (formulář, stavy, napojený web) · **Zákazníci** (věrnost, skupiny) · **Komunikace** (e-maily, upozornění, šablony zpráv zákazníkům z RD16, pokud už existují). Každá sekce je jedna stránka s formuláři pod sebou nebo záložkami.
2. **Staré adresy žijí.** `/nastaveni/sluzby`, `/oteviraci-doba`, `/formular`, `/stavy`, `/emaily`, `/web`, `/vernost`, `/skupiny`, `/vzhled`, `/funkce` přesměruj na nové místo (kotva). Odkazy z e-mailů a ⌘K fungují.
3. **Funkce podle oboru.** Nahoře „Co v aplikaci používáte?“ s hotovou sadou podle oboru (z šablony oboru), jednotlivé přepínače schované pod „Upravit“. Závislosti (Daně → Příjmy, Hodnocení → Portál, Připomínky → Kalendář) se zapnou samy s vysvětlením jednou větou; vypnutí schová funkci, data zůstanou.
4. **Automatické ukládání** tam, kde je změna malá a vratná (přepínače, vzhled, pravidla portálu, nastavení e-mailů): „Uloženo · Zpět“. Složité formuláře (služby, směny, kolonky) si nechají výslovné Uložit. Jednotný hák místo opakovaného kódu.
5. **Začátek do 3 minut.** Na Dnes kontrolní seznam „Začněte“ (služby, otevírací doba, odkaz na objednání, první poptávka), odvozený z dat, zavřít jde, po dokončení zmizí. Šablona oboru musí fungovat bez jediného kliknutí v Nastavení.
6. **Vlastník vs. pracovník.** Pracovník Nastavení nevidí (Účet z RD01 mu ho nenabízí); přímý odkaz ukáže stručné vysvětlení.
7. **Testy:** přesměrování starých adres, závislosti funkcí, automatické uložení a „Zpět“, výchozí sada podle oboru.

## Hotovo, když
- Nová firma z šablony oboru použije aplikaci bez návštěvy Nastavení; kontrolní seznam ji vede.
- Test „člověk, který aplikaci neviděl“ zvládne přidat službu a nastavit otevírací dobu bez návodu.
- Žádný starý odkaz nevede na 404; testy, `tsc`, `build:check` procházejí; vzhled ověřen na 390 / 768 / 1280 / 1440 px.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD13 v plánu. Commit `ws/nastaveni: pět sekcí, funkce podle oboru, automatické ukládání`.
