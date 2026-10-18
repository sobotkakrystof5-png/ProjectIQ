# Prompty pro Claude Code — redesign aplikace Workspace

Sedmnáct sezení (RD00–RD16). **Jedno sezení = jedna nová konverzace v Claude Code** v kořeni repa
`ZakazIQ`, na větvi `ws/redesign-app` (vznikne v RD00). Každé sezení začíná přečtením paměti
a končí jejím zápisem, takže na sebe navazují i bez kontextu z minula.
Zdroj pravdy je plán `docs/workspace/REDESIGN-APP-PLAN.md` (fáze, rozhodnutí D-1–D-10, tabulka stavu).

## Jak spustit sezení

1. Otevři Claude Code v repu, nová konverzace (`/clear`).
2. Zkopíruj celý obsah souboru `RDxx-….md` jako první zprávu.
3. Na otázky odpovídej hned, Claude je klade jen tam, kde by odhad stál za přepracování.
4. Na konci zkontroluj body „Hotovo, když“ a že je zapsaná paměť (`memory/memory.md`) i stav v plánu (sekce 5).
5. Teprve pak další sezení.

Kdyby sezení nestihlo vše: napiš „ukonči sezení podle zakaziq-memory“ a v novém sezení dej stejný
prompt znovu. Pokračuje podle `memory/memory.md` (Aktuální stav a Changelog) a tabulky v plánu.

## Pořadí a závislosti

| # | Sezení | Hlavní skilly | Potřebuje |
|---|---|---|---|
| RD00 | Příprava, větev, testovací DB, měření | zakaziq-memory | D-7, D-8 |
| RD01 | Menu a Účet: Nastavení do Účtu | design-dilky, ux-texty-cs | RD00 |
| RD02 | Rychlost I: region, kola do DB, streaming | workspace-backend | RD00, D-6 |
| RD03 | Rychlost II: dotazy, indexy, klient, bundle | workspace-backend | RD02 |
| RD04 | Dnes, hlavička, společné komponenty | design-dilky, ux-texty-cs | RD02, D-3 |
| RD05 | Kalendář | design-dilky, workspace-backend | RD04 |
| RD06 | Zakázky | design-dilky | RD04 |
| RD07 | Zákaznická objednávka `/r` + widget + pracovníci | backend + design | RD04 |
| RD08 | Více služeb + vlastní rezervace | backend + design | RD05, RD07, D-5 |
| RD09 | Kapacita / skupinové termíny (volitelné) | backend + design | RD08, D-4 |
| RD10 | Fakturace | backend + design, ux-texty-cs | RD04, D-5 |
| RD11 | Přehled peněz, Daně, soukromí | backend + design, web-security-* | RD10, D-1 |
| RD12 | Věrnostní karty | design + backend | RD04 |
| RD16 | Zákazníci: telefon, e-mail a „Napsat“ jedním klikem (doporučeně hned za RD12) | backend + design, ux-texty-cs | RD04, D-10 |
| RD13 | Nastavení: 5 sekcí, funkce podle oboru | design + backend | RD01, RD10, RD12 |
| RD14 | Návody | ux-texty-cs, humanize-text-cs, design | RD13, D-2 |
| RD15 | Vizuální sjednocení + závěrečné ověření | design-dilky, web-security-review | vše |

Po RD04 jsou RD05, RD06, RD07, RD10, RD12, RD16 na sobě nezávislé a jde je prohodit podle toho, co tě nejvíc
pálí. RD09 je volitelné.

## Společná pravidla (platí v každém sezení)

- Česky, stručně. Na začátku řekni záměr, na konci výsledek, skutečné ověření a co zbývá.
- **Admin neměň** (`app/{dashboard,alteno,hub,(auth),p,h}`, `app/*-actions.ts`, `lib/*.ts`, `components/*.tsx`).
  Výjimka jen s výslovným souhlasem a jen v RD11.
- Data jen přes `requireWorkspace()` a `account_id`. Nová tabulka = migrace od **085** (číslo vždy další volné),
  idempotentní, doplnit `seedAccount()` v testovacím helperu. **Migrace jen připravit, aplikuje je Kryštof.**
  Seed jen na testovací větvi Neonu, nikdy na produkci.
- Jen Dílky. Texty podle `zakaziq-ux-texty-cs`. Žádné vymyšlené údaje.
- Staré adresy zůstávají funkční (přesměrování).
- Cizí neuložené změny nepřepisuj, nevracej ani nestaguj. Stageuj jen konkrétní soubory, nikdy `git add -A`.
- Deploy, push na `main` a změny externích služeb jen s výslovným souhlasem.
- Po sezení: `npx tsc --noEmit`, `npm test`, `npm run build:check` (při běžícím dev), vzhled na 390 / 768 / 1280 / 1440 px.
  Co jsi neověřil s přihlášením, napiš. Neoznačuj neověřené za hotové.

## Skilly

Projektové (`.claude/skills/`): `zakaziq-design-dilky`, `zakaziq-workspace-backend`, `zakaziq-ux-texty-cs`, `zakaziq-memory`.
Uživatelské: `web-security-review` (před commitem u veřejných vstupů a DB), `web-security-memory` (při zápisu bezpečnostní změny),
`humanize-text-cs` (texty pro lidi, hlavně RD14), `frontend-design`.

## Než začneš první sezení

Odpověz na rozhodnutí D-1–D-10 v plánu (sekce 6). Co nestihneš, sezení se zeptá samo, ale RD00 je potřebuje
všechna, aby je zapsalo jako R-058.
