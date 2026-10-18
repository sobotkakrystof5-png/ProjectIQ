# RD11 — Přehled peněz, Daně a soukromí údajů

## Cíl
Přehled peněz řekne v pěti vteřinách, jak se daří a kolik odložit na daně. Daně se nastaví třemi otázkami. Údaje uživatelů zůstanou soukromé, i vůči provozovateli (úroveň podle D-1).

## Než začneš
Rituál začátku (`zakaziq-memory`): `git status`, větev `ws/redesign-app`, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`.
Přečti `docs/workspace/REDESIGN-APP-PLAN.md` (F7, D-1), R-049, R-052, `docs/workspace/MONEY.md`, `.claude/security/{STATE,DECISIONS}.md` a `AGENTS.md` B13. Skilly: `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `web-security-review`, `web-security-memory`.
Společná pravidla: `new - area of zakaziq/prompty/redesign/00-README.md`. Soubory: `components/ws/money/*` (po RD10), `lib/ws/money/{calculations,defaults,reminders}.ts`, `lib/ws/admin/*`, `app/dashboard/klienti/*`, `lib/ws/theme.ts` (vzor cookie).
Potřebuje D-1. Bez rozhodnutí se zeptej, jakou úroveň soukromí Kryštof chce.

## Kroky
1. **Přehled.** Nahoře tři čísla (Příjmy, Výdaje, Rozdíl) pro zvolený měsíc, vedle „Odložit na daně“ (jen když je odhad k dispozici) a „Po splatnosti: N faktur“ s odkazem. Graf pod tím. Rozpady podle skupin, služeb a zdroje do záložky Rozbory. Jedna hlavní akce.
2. **Daně.** Průvodce nastavením se třemi otázkami: OSVČ hlavní/vedlejší, výdaje paušálem/skutečné, plátce DPH. Ostatní pole (pásmo, měsíce, minimum zdravotního, sleva, zálohy, způsob podání) pod „Pokročilé“ s rozumnými výchozími hodnotami. Nahoře věta „Za 2026 odhadujeme X, odkládejte Y měsíčně“, termíny, pruh k hranici DPH. Sazby a výpočty **beze změny**.
3. **Úroveň 2 — Režim soukromí v aplikaci.** Oko v hlavičce: částky a jména zákazníků rozmazané, odkryjí se klepnutím; pamatuje zařízení (cookie jako `lib/ws/theme.ts`, bez bliknutí při načtení). Pokrývá Dnes, Zákazníky, Peníze, Faktury.
4. **Úroveň 1 — Admin nevidí osobní údaje.** Zeptej se, zda smíš sáhnout na admin (`lib/ws/admin/*`, `app/dashboard/klienti/*`). Audit: co admin dnes čte (`clients.ts` čte souhrny a e-maily členů týmu, ověř i `audit_log.details`, poznámky a odkazy). Přidej test, který hlídá, že SQL v `lib/ws/admin/` nesahá na obsah tabulek zákazníků, poptávek, termínů, faktur a plateb. Zapiš do `.claude/security/DECISIONS.md`, spusť `node scripts/sync-agent-context.mjs --write` a `--check`.
5. **Úroveň 3 — šifrování sloupců:** nedělej bez samostatného schváleného návrhu (rozbíjí hledání, řazení a součty v SQL). Pokud ji Kryštof chce, napiš návrh do plánu a skonči.
6. **Poctivý text.** Do Zpracování údajů a podmínek napiš pravdivě, co provozovatel technicky vidí a co ne; zbytek `[DOPLNIT]` pro právníka.
7. **Testy:** výpočty daní beze změny (existující testy), režim soukromí (cookie → vykreslení), hlídač čtení adminu.

## Hotovo, když
- Přehled i Daně se vejdou na první obrazovku telefonu bez rolování k hlavním číslům.
- Režim soukromí funguje a nebliká; hlídač čtení adminu je v testech.
- Nic z výpočtu daní se nezměnilo; testy, `tsc`, `build:check` procházejí.

## Konec sezení
`zakaziq-memory` → Konec sezení. Bezpečnostní změna do `.claude/security/` ve stejném commitu. Stav RD11 v plánu. Commit `ws/penize: přehled, daně, režim soukromí`.
