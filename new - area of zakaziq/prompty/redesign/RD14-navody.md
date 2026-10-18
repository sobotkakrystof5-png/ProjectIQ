# RD14 — Návody: jak aplikaci využít co nejlíp

## Cíl
Samostatná sekce **Návody** s vlastními záložkami. Krátké návody říkají, jak z aplikace dostat nejvíc, a z každé obrazovky se k nim dá dojít malým „?“.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F10, D-2), `docs/workspace/PLAN.md` (sekce o jednoduchosti) a `AGENTS.md` B8–B11. Skilly: `zakaziq-ux-texty-cs`, `humanize-text-cs`, `zakaziq-design-dilky`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `lib/ws/paths.ts` (`RESERVED_BUSINESS_SLUGS`), `lib/ws/nav.ts`, `lib/ws/features.ts`,
`components/ws/app/command-palette.tsx`, `PageHeader` z RD04, `app/w/[business]/[section]/page.tsx` (zástupná stránka).
Potřebuje D-2 (záložky + „?“, nebo i plovoucí nápověda). Bez rozhodnutí použij záložky + „?“ v záhlaví a napiš to.

## Kroky
1. **Trasa a menu.** `/w/[byznys]/navody` a `/w/[byznys]/navody/[tema]`; `navody` do rezervovaných slugů; položka Návody v hlavním menu (a v menu na telefonu). Zkontroluj, že hlavní menu zůstává krátké (RD01).
2. **Záložky.** Začínáme · Poptávky a kalendář · Zákazníci a věrnost · Faktury a peníze · Daně · Napojení webu · Zkratky a ⌘K. Záložka = téma v URL, sdílitelná. Záložky pro vypnutou funkci se neukazují (stejné pravidlo jako menu).
3. **Obsah.** Typovaná data v `lib/ws/guides/` (`Guide { tema, slug, title, minutes, steps: { title, text, href? }[] }`), ne v databázi. Asi 12 návodů po 3–6 krocích („Jak potvrdit poptávku jedním klikem“, „Jak vystavit fakturu za 30 sekund“, „Jak nastavit věrnostní kartu“, „Jak napojit web“, „Jak používat ⌘K“…). Píšou se **jen věci, které v aplikaci opravdu fungují** (ověř proti `WS_FEATURES` a kódu), bez vymyšlených čísel a slibů.
4. **Texty.** Obyčejná čeština, vykání, žádný žargon, podle `zakaziq-ux-texty-cs`; pak `humanize-text-cs`. Každý krok jedna věta + případně tlačítko „Otevřít tuhle obrazovku“ (odkaz na skutečnou obrazovku aktuálního byznysu).
5. **Malé „?“.** Komponenta `HelpLink` v `PageHeader` vede na správný návod. Pouze tam, kde návod existuje.
6. **⌘K.** „Návody“ a hledání názvu návodu. Hledání v návodech jednoduché (shoda v názvu a krocích), bez nové závislosti.
7. **Vzhled.** Dílky, výřezy rozhraní jako označená ukázka, tmavý režim, telefon (záložky se posouvají, velké plochy).
8. **Testy:** každý `href` v návodech vede na existující cestu, žádný návod nezmiňuje vypnutou funkci jako dostupnou, záložky se při vypnuté funkci schovají.

## Hotovo, když
- Z každé hlavní obrazovky se přes „?“ dostanu na návod k ní a z návodu na ni zpět.
- Všechny kroky v návodech odpovídají skutečné aplikaci (ověřeno průchodem).
- Testy, `tsc`, `build:check` procházejí; vzhled ověřen na 390 / 768 / 1280 / 1440 px.

## Konec sezení
`zakaziq-memory` → Konec sezení (nový dokument/oblast do `memory/index.md`). Stav RD14 v plánu. Commit `ws/navody: záložky s návody a nápověda z obrazovek`.
