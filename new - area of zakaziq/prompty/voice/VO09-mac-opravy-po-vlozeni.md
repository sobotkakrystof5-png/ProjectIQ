# VO09 — Mac: zachycení oprav po vložení

> Sezení pro Claude Code na **MacBooku**, v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`.

## Cíl jednou větou

Když Kryštof vložený text v aplikaci opraví, ZakazIQ Voice to pozná a pošle opravený úsek
serveru, aby se z něj učil.

## Než začneš

1. Skill `zakaziq-memory` (začátek).
2. Plán `docs/admin/VOICE-PLAN.md` oddíly 3 (bod 6), 5, 13 (riziko Electron a web).
   Server `/feedback` z VO08 musí běžet. Kód z VO06 (`Paster`).

## Rozsah

- `Paste/FocusReader.swift` — přes Zpřístupnění (`AXUIElementCreateSystemWide`,
  `kAXFocusedUIElementAttribute`): role prvku, `kAXValueAttribute`,
  `kAXSelectedTextRangeAttribute`. **Nikdy** u `AXSecureTextField` ani při bezpečném vstupu.
  Pole delší než 50 000 znaků nečíst.
- `Paste/EditWatcher.swift` — po vložení si zapamatuj prvek, celý obsah a místo vložení
  (text před a za vloženým úsekem jako kotvy, aspoň 20 znaků nebo začátek/konec pole).
  Obsah přečti znovu, když: uplyne 60 s, Kryštof přejde do jiného pole nebo aplikace,
  stiskne Enter (zachytí `FnMonitor` přes `keyDown`, nic nepohlcuje), nebo začne nový diktát.
  Najdi úsek mezi kotvami; když se liší od vloženého textu, pošli `POST /feedback`
  `{ id, editedText }`. Když kotvy chybí (pole se vymazalo, text odešel jako zpráva), pošli
  nic — **nehádat**.
- Čistá funkce `locateEditedSegment(before, after, inserted, anchors)` v samostatném souboru,
  ať jde testovat bez systému.
- Volba v nastavení **„Učit se z mých oprav"** (výchozí zapnuto). Když vypnuto, nic se nečte.
- Odeslání oprav přes stejnou frontu jako diktáty (bez sítě počká, nejvýš 24 h).
- Do historie příznak „opraveno" (Domů v okně ho ve VO11 ukáže).
- Místní počítadlo „pole nešlo přečíst" podle aplikace (jen čísla, pro ladění, v okně
  Nastavení → O aplikaci).

## Mimo rozsah

Okno aplikace (VO11). Učení samotné je na serveru (VO08).

## Testy

XCTest na `locateEditedSegment`: oprava jednoho slova, doplněná čárka, smazaný konec,
text vložený doprostřed odstavce, chybějící kotva → nic, pole přepsané celé → nic,
opakovaný text v poli (kotvy rozhodnou). `make test`.

## Ověření naostro

Nadiktuj větu se jménem, které přepis píše špatně (třeba „Prvotka"), oprav ho v TextEditu,
Mailu a Poznámkách a počkej minutu nebo stiskni Enter: na serveru je `edited_text`
a dvojice opravy (zkontroluj v DB nebo přes admin z VO10, je-li hotový). Po třech opravách se
slovo naučí a čtvrtý diktát už je správně. Vyzkoušej Slack a Safari (Electron a web často
pole nečtou) a zapiš do plánu, kde zachycení funguje.

## Hotovo, když

- Opravy v běžných aplikacích dojdou na server, z pole pro heslo nikdy nic.
- Bez kotev se nic neposílá, vypnutá volba nic nečte.
- Tabulka aplikací (funguje / nefunguje) je v plánu.
- `make -C voice-mac test app` prošlo.

## Konec sezení

Skill `zakaziq-memory`. Stav VO09 v plánu. Commit `feat: voice zachycení oprav po vložení`.
