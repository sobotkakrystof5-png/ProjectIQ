# KP09 — Předání požadavku do Claude Code (volitelné)

## Cíl
Z požadavku klienta se dostat do Claude Code rychleji než ruční kopírování, **ale vždy se souhlasem člověka**. Úroveň 1 (kopírovat zadání) už je hotová. Tady jde o úroveň 2 a o ověřovací experiment s úrovní 3.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 4.5, 5, 7 (D-K7), 8, výsledky KP07 v paměti, `.claude/security/DECISIONS.md` #018.
**Aktuální dokumentaci si přečti znovu, nespoléhej na paměť:** <https://code.claude.com/docs/en/routines>, <https://platform.claude.com/docs/en/api/claude-code/routines-fire>, <https://code.claude.com/docs/en/channels-reference>, <https://code.claude.com/docs/en/cli-reference>. Funkce jsou experimentální nebo ve fázi preview a mění se.
Skilly: `zakaziq-workspace-backend`, `web-security-review`, `web-security-memory`.
**Admin:** povolená je jen karta požadavku a nastavení projektu (cesta k repu, repozitář pro cloud). Potřebuje D-K7; bez výslovného souhlasu **úroveň 3 nestav**.

## Kroky
1. **Úroveň 2: příkaz do terminálu.** Tlačítko „Otevřít v Claude Code“ vygeneruje příkaz, který spustí Claude Code v repu projektu s tímto zadáním (cesta k repu je nastavení zakázky uložené jen v adminu). Zadání se do příkazu předává bezpečně (soubor v dočasné složce nebo stdin, ne vložením textu klienta do shellového řetězce); ošetři uvozovky a speciální znaky a napiš test, který ověří, že text s `$(…)`, zpětnými apostrofy a středníky nic nespustí. Příkaz se **nespouští ze serveru**, jen se zobrazí ke zkopírování.
2. **Úroveň 3: experiment, ne produkce.** Prověř, zda Routines API zvládne scénář „zadání → nová větev + pull request v repu klienta ke kontrole“. Cíl experimentu: ověřit, jak vypadá výsledek, kolik stojí běh a co se stane při chybě. Pravidla: jen na testovacím repu, rutina smí jen otevřít větev nebo PR (nikdy nemergovat ani nasazovat), token rutiny jen server-side v env, nikdy v repu, limit volání (30 za hodinu na rutinu je tvrdý strop platformy), každé spuštění potvrzuje Kryštof tlačítkem u konkrétního požadavku. Text klienta jde do `text` jako nedůvěryhodný podklad v citaci.
3. **Vyhodnocení.** Zapiš do paměti, co experiment ukázal (kvalita, cena, bezpečnostní nálezy), a doporuč Kryštofovi: nasadit, nebo nechat u úrovně 2. Rozhodnutí o nasazení úrovně 3 je samostatné R-0xx.
4. **Co se nikdy nedělá:** automatické spuštění agenta bez kliknutí člověka, spuštění na repu s produkčními secrets, merge nebo deploy z rutiny, předání nahrávky nebo souboru agentovi bez kontroly.
5. **Testy:** sestavení příkazu odolné proti injekci; token rutiny není v odpovědi ani logu; spuštění vyžaduje oprávnění admina; chybějící konfigurace vypne tlačítko.
6. **Paměť.** `web-security-review`, `DECISIONS.md` (rozhodnutí o úrovních a přijatá rizika), changelog, stav v plánu.

## Hotovo, když
- Tlačítko úrovně 2 otevře Claude Code se zadáním a test injekce prochází.
- Experiment úrovně 3 je popsaný v paměti včetně toho, co se nepovedlo, a Kryštof o dalším kroku rozhodl.
- Nic se nespouští bez kliknutí člověka.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit na požádání, např. `ws/pozadavky: předání do Claude Code (úroveň 2)`.
