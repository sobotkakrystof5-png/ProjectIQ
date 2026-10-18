# RD01 — Menu a Účet: Nastavení pryč z hlavního menu

## Cíl
Hlavní menu je kratší a nic v něm nepřekáží. **Nastavení jde do Účtu** (rozhodnutí D-9), Faktury, Příjmy a Daně
se v menu spojí do jednoho místa Peníze. Adresy zůstávají, takže se nic nerozbije.

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (sekce 3, F1, rozhodnutí) a `AGENTS.md`. Skilly: `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `lib/ws/nav.ts`, `components/ws/app/app-frame.tsx`,
`components/ws/app/nav-icon.tsx`, `components/ws/app/command-palette.tsx`, `components/ws/money/page.tsx`, `lib/ws/__tests__/ws-app-shell.test.ts`.

## Kroky
1. **Menu.** V `lib/ws/nav.ts` zůstane v hlavním menu: Dnes, Poptávky, Kalendář, Zákazníci, Zakázky, Peníze. `nastaveni` z hlavního menu odeber (cesty a `navItemForSegment` pro něj dál fungují). `faktury`, `prijmy`, `dane` sluč do položky Peníze, která vede na první zapnutou peněžní funkci (logika z `bottomBarSlots`). Pozor, spodní lišta na telefonu už Peníze má.
2. **Účet.** Dole v postranním panelu tlačítko **Účet** (jméno firmy nebo iniciála) otevře malé menu (Radix `dropdown-menu` z `components/ui`): Nastavení firmy · Předplatné a doklady · Vzhled · Zpracování údajů · Odhlásit. Odkazy na `/w/[byznys]/nastaveni`, `/w/ucet`, `/w/ucet/zpracovani`. Nevlastník vidí jen Vzhled a Odhlásit. Texty podle `zakaziq-ux-texty-cs`.
3. **Telefon.** Ve výsuvném menu stejné položky pod oddělovačem. Spodní lišta beze změny.
4. **Aktivní stav.** Účet svítí na `/w/ucet*` i na `/nastaveni*`.
5. **⌘K.** „Nastavení“ a podstránky se dál najdou, přidej „Účet a předplatné“, pokud chybí.
6. **Staré cesty.** `/w/[byznys]/faktury`, `/prijmy`, `/dane` a všechny `/nastaveni/*` zůstávají funkční, odkazy z e-mailů a detailů se nesmí rozbít. Záložky uvnitř Peněz zůstávají.
7. **Přístupnost.** Klávesnice (šipky, Esc), viditelný focus, plochy ≥ 44 px, tmavý režim.
8. Uprav testy (`ws-app-shell`, případně nav) a přidej test: hlavní menu má 6 položek při všech funkcích, Nastavení tam není, Peníze mizí, když není zapnutá žádná peněžní funkce.

## Hotovo, když
- Hlavní menu má nejvýš 6 položek, Nastavení se otevře ze dvou kliků z Účtu.
- Žádný starý odkaz nevede na 404, testy a `tsc` prochází.
- Ověřeno na počítači i telefonu, světlý i tmavý režim.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav RD01 v plánu. Commit `ws/menu: nastavení do účtu, peníze v jednom místě`.
