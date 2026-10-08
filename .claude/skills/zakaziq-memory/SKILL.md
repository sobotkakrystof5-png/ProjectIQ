---
name: zakaziq-memory
description: Paměťový systém projektu ZakazIQ ve složce memory/ (index.md, pravidla.md, memory.md) a rituál začátku a konce sezení S00–S19. Použij na začátku každého sezení Claude Code, na jeho konci, kdykoli padne rozhodnutí (technické, produktové, designové), když narazíš na otevřenou otázku, a když se uživatel ptá, kde projekt je nebo co se dělalo minule.
---

# Paměť projektu ZakazIQ

Sezení Claude Code si nepamatují nic. Paměť je v repu ve složce `memory/` (R-013, R-014) a sdílí
ji všichni agenti. **Formát a pravidla zápisu jsou v `memory/pravidla.md` — ty platí, tenhle skill
je jen rituál kolem nich.** Bezpečnostní stav má vlastní složku `.claude/security/` (skill
`web-security-setup`), tady se na něj jen odkazuje.

| Soubor | Co v něm je | Jak se mění |
|---|---|---|
| `memory/index.md` | mapa: kde co najít | nový dokument / nová oblast |
| `memory/pravidla.md` | co se kam zapisuje, kdy a v jakém formátu | zřídka |
| `memory/memory.md` → 1. Aktuální stav | snímek: fáze, tabulka sezení S00–S19, rozpracované, další krok | přepisuje se |
| `memory/memory.md` → 2. Rozhodnutí | `R-xxx` + proč + důsledek | jen přidávat; změna = nový záznam, starý „Nahrazeno" |
| `memory/memory.md` → 3. Otevřené problémy | co je potřeba rozhodnout / opravit a co to blokuje | rozhodnuto → smazat a zapsat jako `R-xxx` |
| `memory/memory.md` → 4. Changelog | co se stalo, nejnovější nahoře, po dnech | jen přidávat |

Stará struktura `.claude/memory/` (STATE, DECISIONS, SESSION-LOG, OPEN-QUESTIONS) se **nepoužívá**.

## Začátek sezení

1. `CLAUDE.md`, `AGENTS.md` a `memory/*` se načítají automaticky. Projdi `memory/memory.md` →
   Aktuální stav (tabulka sezení) a posledních pár dní Changelogu.
2. Zkontroluj Otevřené problémy: blokuje něco tohle sezení? Pokud ano, **zeptej se hned**,
   nestav na odhadu.
3. Ověř, že repo odpovídá Aktuálnímu stavu (`git status`, `git log -5`, větev `workspace`).
   Nesedí-li, napiš to.
4. Napiš plán sezení: co uděláš, co **nebudeš** měnit, jak ověříš hotovo.

## Během sezení

- Rozhodnutí, které by příští sezení mohlo udělat jinak (knihovna, tvar tabulky, pojmenování,
  výjimka z pravidla), hned zapiš jako nové `R-xxx` do Rozhodnutí.
- Otázku, kterou nemůžeš rozhodnout sám, zapiš do Otevřených problémů a v sezení použij
  nejbezpečnější vratnou variantu; řekni to.
- Po každé dokončené změně (typicky commit) záznam do Changelogu — ne až na konci sezení.

## Konec sezení (povinné)

1. Aktuální stav: posuň stav sezení v tabulce (čeká → rozpracováno → hotovo), přepiš
   „Rozpracováno" (co hotovo, co zbývá, kde pokračovat) a „Další krok", datum v hlavičce.
2. Changelog: záznamy za sezení (hotovo, soubory, migrace + zda aplikovaná, výsledek build/test).
3. Rozhodnutí a Otevřené problémy podle potřeby.
4. Změnil se technický fakt (tabulka, routa, env, API, pravidlo)? Oprav `AGENTS.md`
   (v `CLAUDE.md` jen výtah s odkazem). Nový dokument → `memory/index.md`.
5. Paměť jde do **stejného commitu** jako práce sezení (větev `workspace`, zpráva `ws/oblast: …`
   nebo podle promptu sezení).
6. Uživateli napiš 3–5 vět: co je hotové, co ověřit / udělat on, jaké je další sezení.

## Pravidla zápisu

- Česky, krátce, konkrétně (cesty, názvy, čísla). Datum vždy absolutní `YYYY-MM-DD`.
- Nikdy secrets, hesla, klíče, hodnoty z `.env.local` ani osobní údaje zákazníků.
- Neodstraňuj historii; opravy jako nový záznam.
- `memory/memory.md` drž pod ~400 řádky — starší měsíce changelogu do `memory/archiv/`.
