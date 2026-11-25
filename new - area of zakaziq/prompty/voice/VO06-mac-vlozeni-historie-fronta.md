# VO06 — Mac: odeslání, vložení, historie, fronta (milník 1)

> Sezení pro Claude Code na **MacBooku**, v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`.

## Cíl jednou větou

Po puštění Fn se nahrávka pošle serveru a vrácený text se vloží tam, kde byl kurzor; bez sítě
diktát počká ve frontě a všechno je v historii. Tím je **milník 1: diktuji Fn**.

## Než začneš

1. Skill `zakaziq-memory` (začátek), `zakaziq-ux-texty-cs`.
2. Plán `docs/admin/VOICE-PLAN.md` oddíly 2 (D-V10), 3 (body 3–5), 7 (kontrakt `/dictate`
   a kódy chyb). Serverová strana z VO02 musí běžet (`npm run dev`).
3. Kód z VO03–VO05.

## Rozsah

- `Net/DictateUpload.swift` — multipart `audio` (m4a) + `meta` (JSON přesně podle plánu,
  `id` = UUID vytvořené při začátku nahrávky), `Authorization: Bearer` z Klíčenky, timeout
  30 s. Opakovat jen síťové chyby, 502 a 429 (s čekáním z odpovědi nebo 5–60 s); 4xx ne.
- `Paste/Paster.swift`:
  1. Pokud je aplikace vpředu jiná než při stisku Fn (pid), **nevkládat**: text dát do
     schránky a v liště „Text je ve schránce".
  2. Jinak: uložit všechny položky schránky (`NSPasteboard.general`, všechny typy), vložit
     text, poslat ⌘V (`CGEvent` klávesa 9 s `maskCommand` na `.cghidEventTap`), po 0,6 s
     schránku vrátit — **jen když `changeCount` je pořád ten náš**.
  3. Prázdný text (`empty`, `blocked`) se nevkládá; lišta krátce ukáže „Nic jsem neslyšel".
- `Store/LocalDB.swift` — systémové `sqlite3` (bez balíčků), soubor v Application Support
  s právy 0600. Tabulky:
  - `history`: id, začátek, aplikace, stav, slova, text, `synced`, chyba; drží 90 dní
    (stejně jako server, volba v nastavení),
  - `queue`: id, cesta k nahrávce, meta, pokusy, další pokus; **nahrávka nejvýš 24 h**, pak se
    smaže a diktát v historii dostane „Nepodařilo se přepsat".
- **Fronta (D-V10):** bez sítě nebo při 502 zůstane nahrávka ve frontě, lišta „Bez připojení,
  diktát počká". Fronta se zkouší při obnovení sítě (`NWPathMonitor`) a každou minutu.
  Přepsaný diktát z fronty se **sám nevkládá**: jde do historie a lišta/oznámení nabídne
  „Zkopírovat". Stejné `id` = server nic nezdvojí.
- Po úspěchu nahrávku smazat. Diktát zrušený Esc pošli jen jako meta s `cancelled: true`
  bez zvuku (server z VO02 to uloží jako `cancelled`, kvůli statistice) a nahrávku hned smaž.
- Menu v liště: **Zkopírovat poslední diktát**, **Diktovat** (zapnuté), počet diktátů ve
  frontě, je-li nějaký.
- Lišta: stav zpracování, hotovo, chyby z kódů serveru česky (`UNAUTHORIZED` → „Klíč
  zařízení neplatí. Vložte nový v Nastavení.", `TOO_LARGE`, `RATE_LIMITED`, `STT_FAILED`…).
- Zvuk začátku a konce (systémové „Tink"/„Pop"), volba v nastavení, výchozí vypnuto.
- Do historie i na server jde celkový čas od puštění Fn po vložení (měřítko rychlosti).

## Mimo rozsah

Zachycení oprav (VO09), okno s historií (VO11; zatím stačí položka menu).

## Testy

XCTest: sestavení multipartu a JSON meta (proti ukázce v plánu), rozhodnutí vložit / jen
schránka, vrácení schránky jen při stejném `changeCount`, fronta (24 h, opakování, které
chyby se opakují), LocalDB (vytvoření, zápis, úklid 90 dní). `make test`.

## Ověření naostro (milník 1)

Proti `npm run dev` s testovacím Neonem: diktát do TextEditu, Mailu, Zpráv, Slacku,
Safari (pole formuláře), Terminálu a do Claude. Pro každou aplikaci zapiš do plánu, jestli
vložení prošlo. Dál: vypnutá Wi-Fi → fronta → zapnutá → přepsáno a nabídnuto ke zkopírování;
přepnutí aplikace během zpracování → text ve schránce; schránka po vložení vrácená (zkopíruj
si předtím obrázek). Změř čas od puštění Fn po vložení u 10 krátkých diktátů (p50).

## Hotovo, když

- Podržím Fn, mluvím, pustím a text se vloží v běžných aplikacích; v historii je.
- Bez sítě nic nezmizí, fronta se dožene, nic se nevloží samo pozdě.
- Schránka po vložení zůstane, jak byla.
- `make -C voice-mac test app` prošlo, tabulka aplikací a p50 jsou v plánu.

## Konec sezení

Skill `zakaziq-memory` (changelog: milník 1). Stav VO06 v plánu. Commit
`feat: voice vložení textu, historie a fronta`.
