# S09 — Kostra aplikace a obrazovka Dnes

## Cíl
Rozložení aplikace Workspace ve stylu Dílků (postranní panel, hlavička s přepínačem byznysů,
⌘K, pravý panel detailu) a obrazovka **Dnes**: vše podstatné na jedné obrazovce.

## Než začneš
Rituál začátku. Načti `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`. Rozložení podle mockupu
**C** (Hybrid — příchozí | kalendář | karta zákazníka) a **D** (mobil), vzhled podle **LP-D**.

## Kroky
1. `app/w/[business]/layout.tsx`: postranní panel `navy-950` s logem a položkami jen pro
   zapnuté funkce (Dnes, Poptávky, Kalendář, Zákazníci, Zakázky, Faktury, Příjmy, Daně,
   Nastavení), aktivní položka `navy-700`. Hlavička: přepínač byznysů (pilulky), vyhledávání,
   „+ Nová". Na telefonu spodní lišta (Dnes, Kalendář, +, Zákazníci, Peníze).
2. `/w` přesměruje na poslední použitý byznys.
3. **⌘K (command):** hledání zákazníků, poptávek, faktur; akce „Nová rezervace", „Nová faktura",
   „Zkopírovat odkaz na objednání". Příkaz v češtině („rezervace Tereza pátek 9:00") zatím jen
   jako navržený parser s testy, ne AI.
4. **Pravý panel** (`Sheet` na desktopu, celá obrazovka na mobilu) pro detail čehokoli, URL
   stav přes `?detail=…`, ať jde sdílet a funguje „zpět".
5. **Dnes** (`/w/[business]`): Příchozí poptávky (seznam, nové jako signal blok), týdenní
   kalendář s termíny a čárkovanými bloky poptávek, karta vybraného zákazníka s věrnostní kartou.
   Zatím na datech ze seed skriptu `scripts/ws-seed.ts` (fiktivní jména, jasně testovací).
6. **Prázdné stavy** podle `zakaziq-ux-texty-cs` (nový účet nemá nic → jeden úkol: odkaz na
   objednání).
7. Upozornění v aplikaci (zvonek) — kostra, data v S15.
8. Výkon: server components, kalendář bez blokujícího JS, skeletony.

## Hotovo, když
- Rozložení odpovídá C (desktop) a D (mobil) ve stylu LP-D, checklist Dílků splněný.
- Žádná akce není dál než 2 kliky od Dnes, ⌘K funguje klávesnicí.
- Uživatel bez dat vidí jasný další krok.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/app: kostra a Dnes`.
