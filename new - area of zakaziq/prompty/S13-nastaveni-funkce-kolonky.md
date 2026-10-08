# S13 — Nastavení: funkce, služby, kolonky, stavy

## Cíl
Klient si sám zapíná funkce a skládá svůj byznys: služby a ceník, otevírací doba a pracovníci,
vlastní kolonky formuláře s živým náhledem, stavy zakázky, věrnost, skupiny, vzhled.

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Mockup C4 (rozložení), LP-D (vzhled). Plán: sekce Nastavení.

## Kroky
1. `/w/[business]/nastaveni` s podstránkami: Funkce · Služby a ceník · Otevírací doba
   a pracovníci · Formulář poptávky · Stavy zakázky · Věrnost · Skupiny zákazníků ·
   Napojený web (S11) · E-maily a upozornění (S15) · Vzhled.
2. **Funkce**: přepínače s popisem jednou větou a závislostmi (Daně potřebují Příjmy…);
   vypnutá funkce zmizí z menu, data zůstanou. Poptávky a Zákazníci vždy zapnuté.
3. **Formulář poptávky**: kolonky (Text, Volba, Výběr, Číslo, Datum, Termín, Kontakt, Adresa,
   Soubor), povinné, na webu ano/ne, přetažení pořadí (`@dnd-kit` už je v repu), **živý náhled**
   jak to uvidí zákazník (stejná komponenta jako `/r/[slug]`). Změna se hned projeví v API schema.
4. **Stavy zakázky**: názvy, pořadí, typ (nová/rozpracovaná/hotová/zaplacená/zrušená); typ řídí
   statistiky a věrnost. Smazání stavu s přesunem zakázek jinam.
5. **Služby, otevírací doba, pracovníci**: délka, cena, kdo dělá, rozestupy, směny, dovolené.
6. **Věrnost a Skupiny**: formuláře nad pravidly z S12 s vysvětlením lidskou řečí
   („Po 5 zaplacených návštěvách dostane zákazník: střih zdarma").
7. **Vzhled**: logo a jedna akcentová barva (s kontrolou kontrastu) pro objednávací stránku,
   portál a e-maily.
8. Všechno nastavení je volitelné — šablona oboru musí fungovat bez jediného kliknutí sem.

## Hotovo, když
- Nová kolonka se během pár sekund objeví v náhledu, na `/r/[slug]` i v API schema.
- Vypnutí funkce ji schová všude, zapnutí vrátí s daty.
- Test „člověk, který aplikaci neviděl" zvládne přidat službu a kolonku bez návodu.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/nastaveni: funkce, kolonky, stavy`.
