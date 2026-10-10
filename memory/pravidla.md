# Pravidla paměti

> Jak se paměť projektu udržuje. Platí pro **každý** AI nástroj i pro člověka. Mapa souborů: [`index.md`](index.md).

## 1. Jedna informace = jedno místo

| Typ informace | Patří do | Nepatří do |
|---------------|----------|-----------|
| Společný tón a protokol sezení pro Codex a další agenty | `AGENTS.md` → Komunikace a protokol sezení | memory.md; CLAUDE.md má jen odkaz |
| Automatické importy a specifika Claude Code | `CLAUDE.md` | AGENTS.md, memory.md |
| Pravidlo pro všechny agenty (hranice v repu, git, pravidla Workspace, „nikdy") | `AGENTS.md` (CLAUDE.md smí mít jen výtah s odkazem) | memory.md |
| Technický fakt o kódu (tabulka, routa, env, API, kódové pravidlo) | `docs/AGENTS-REFERENCE.md` (admin detail v `docs/admin/AGENTS-ADMIN.md`); zásadní pravidla i stručně v `AGENTS.md` | memory.md |
| Co se stalo a kdy | `memory.md` → Changelog | AGENTS.md, commit message jako jediné místo |
| Proč je něco takhle (rozhodnutí, kompromis, zamítnutá alternativa) | `memory.md` → Rozhodnutí | AGENTS.md (tam jen výsledné pravidlo, s odkazem `R-xxx`) |
| Co je rozbité / nedodělané / sporné | `memory.md` → Otevřené problémy | — |
| Kde co najít | `index.md` | — |
| Podrobný plán velkého celku | `docs/*.md` (+ řádek v index.md) | memory.md (tam jen odkaz) |

Duplicitu nahraď odkazem. Narazíš-li na rozpor mezi soubory, **pravdu má kód**; oprav dokument a zapiš to do changelogu.

## 2. Kdy zapisovat

**Po každé dokončené změně** — ne až na konci sezení. Dokončená = funkční kus práce, typicky to, co jde do jednoho commitu.

| Událost | Co udělat |
|---------|-----------|
| Hotová feature / fix / refactor | Changelog + případně Aktuální stav |
| Nová migrace | Changelog (číslo migrace + zda je aplikovaná na produkci) + katalog tabulek (admin `docs/admin/AGENTS-ADMIN.md`, Workspace `docs/AGENTS-REFERENCE.md` → B3) |
| Nová routa / API / cron / env | `docs/AGENTS-REFERENCE.md` + changelog; env i do `.env.example`; zásadní pravidlo i do AGENTS.md |
| Uživatel rozhodl „takhle a ne jinak" | Rozhodnutí (nový `R-xxx`) |
| Objevený bug, který se teď neopravuje | Otevřené problémy |
| Opravený otevřený problém | Smazat z Otevřených problémů + changelog |
| Rozpracovaná práce na konci sezení | Aktuální stav → Rozpracováno (co hotovo, co zbývá, kde pokračovat) |
| Nový dokument / oblast | index.md |

Nezapisuj: drobné přeformátování, pokusy, které se vrátily, nic, co lze triviálně vyčíst z kódu.

## 3. Formáty

**Changelog** — nejnovější nahoře, seskupeno podle dne:

```markdown
### 2026-10-08
- **feat** Krátký popis co a proč. Soubory: `app/x.ts`, migrace 064 (aplikována: ne).
- **fix** …
```

Typy: `feat`, `fix`, `refactor`, `docs`, `chore`, `db`, `decision`. Datum vždy absolutní (`YYYY-MM-DD`), nikdy „včera".

**Rozhodnutí** — číslované, nikdy se nepřečíslovávají:

```markdown
### R-012 · Krátký název (2026-10-08)
**Rozhodnutí:** co platí.
**Proč:** důvod / omezení.
**Důsledek:** co to znamená pro kód (+ odkaz na AGENTS.md sekci, pokud existuje pravidlo).
```

Zrušené rozhodnutí se nemaže — dopiš `**Nahrazeno:** R-0xx (datum)`.

**Otevřený problém** — `- [ ] **Oblast:** popis · kde (soubor) · od kdy`.

## 4. Údržba velikosti

- `memory.md` se načítá do každého sezení — drž ho **pod ~400 řádky**.
- Changelog v memory.md drží jen poslední den práce. Starší dny a měsíce přesuň do `memory/archiv/` (`YYYY-MM.md`, stejný formát) a v memory.md nech odkaz v sekci „Starší“ (R-042). Rozhodnutí a otevřené problémy se nearchivují.
- Aktuální stav přepisuj (je to snímek), changelog jen doplňuj (je to historie).

## 5. Bezpečnost

Do paměti nikdy: hesla, API klíče, hodnoty z `.env.local`, connection stringy, osobní údaje klientů (emaily, telefony). Názvy env proměnných ano, hodnoty ne. Klienty zmiňuj jen jménem firmy/projektu, je-li to nutné.
