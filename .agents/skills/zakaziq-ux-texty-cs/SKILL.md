---
name: zakaziq-ux-texty-cs
description: Pravidla pro všechny české texty ZakazIQ — tlačítka, popisky, chybové hlášky, prázdné stavy, e-maily zákazníkům, upozornění, texty landing page a newsletteru. Jednoduchá čeština pro lidi bez technických znalostí, oslovení vy, žádné vymyšlené údaje. Použij vždy, když píšeš nebo měníš text, který uvidí uživatel aplikace nebo jeho zákazník; u marketingových textů a e-mailů na závěr spusť skill humanize-text-cs.
---

# Texty ZakazIQ

Čtenář je kadeřnice mezi dvěma zákaznicemi nebo zámečník v autě. Má telefon v jedné ruce a
pět vteřin. Každý text musí být pochopitelný napoprvé a říct, co se stalo nebo co udělat.

## Pravidla

1. **Sloveso, ne podstatné jméno.** „Potvrdit termín", ne „Potvrzení termínu".
2. **Žádná technická slova.** Ne: status, confirmed, sync, API, webhook, token, error, invalid,
   ID, segment (v UI „skupina"), modul (v UI „funkce"), workspace (v UI „účet").
   Výjimka: obrazovka Nastavení › Napojený web smí říct „kód" a „klíč".
3. **Oslovení vy**, malým písmenem, přátelsky, bez „Vážený uživateli".
4. **Krátce.** Tlačítko 1–3 slova, popisek do 8 slov, hláška do 2 vět.
5. **Chyba = co se stalo + co teď.** „Tenhle čas už je obsazený. Vyberte prosím jiný."
   Nikdy kód chyby, nikdy „Něco se pokazilo" bez další rady.
6. **Prázdný stav = další krok.** „Zatím žádná poptávka. Zkopírujte odkaz na objednání a dejte
   ho na web nebo do Instagramu." + tlačítko.
7. **Úspěch krátce.** „Uloženo", „Potvrzeno, zákaznice dostala e-mail."
8. **Čísla a data česky:** `1 850 Kč`, `pá 9. 10. v 9:00`, `9:00–11:00`.
9. **Žádné vymyšlené údaje.** Recenze, počty klientů, citace, procenta jen ze skutečných dat.
   Chybí-li, `[DOPLNIT]`.
10. **Odměny a věrnost** pozitivně, bez nátlaku: „Příště má Tereza střih zdarma."

## Slovník (UI)

| Místo | Používej |
|---|---|
| request / lead | poptávka |
| appointment / booking | termín, rezervace |
| customer | zákazník / zákaznice (podle jména), v nadpisech „Zákazníci" |
| job | zakázka |
| stage / status | stav (v Nastavení), jinak konkrétně: „Potvrzeno", „Hotovo" |
| segment | skupina: Noví, Stálí, Jednorázoví, Spící, Ukončení |
| module | funkce |
| business | byznys (v přepínači), jinak název firmy |
| account / workspace | účet |
| subscription | předplatné |
| integration | napojení webu |

## Tón podle místa

- **Aplikace:** věcný, klidný, krátký.
- **E-maily zákazníkům firmy:** jménem firmy, vlídně, konkrétně (kdy, kde, co, za kolik),
  jedno tlačítko. Podpis jménem byznysu, ne ZakazIQ.
- **Upozornění pro majitele:** co se stalo + jedno tlačítko akce.
- **Landing page a novinky:** přímo, v první osobě zakladatele (Kryštof), bez superlativů
  („revoluční", „nejlepší"), bez slibů, které neumíme.

## Na závěr

Marketingové texty, e-maily a newsletter projdi skillem **`humanize-text-cs`**: žádné pomlčky
jako spojky, žádné trojice, žádné „nicméně / v neposlední řadě / je důležité poznamenat".
Fakta a čísla se při tom nesmí změnit.
