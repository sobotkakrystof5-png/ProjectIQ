# VO05 — Mac: lišta s mřížkou dílků

> Sezení pro Claude Code na **MacBooku**, v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`.

## Cíl jednou větou

Malá lišta dole uprostřed obrazovky jako ve Wispr Flow, v barvách ZakazIQ: v klidu pilulka
s mřížkou 2×2 dílků, při mluvení vlnky podle hlasu, při zpracování dílky běží dokola; klik
na ni spustí a zastaví diktát.

## Než začneš

1. Skill `zakaziq-memory` (začátek), `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
2. Plán `docs/admin/VOICE-PLAN.md` oddíl 9 (barvy, tabulka stavů lišty, pravidla).
3. Otevři náhled `new - area of zakaziq/prompty/voice/podklady/lista-nahled.html`
   v prohlížeči. Je to předloha velikostí, barev a stavů, ne kód k převzetí.
4. Kód z VO03 a VO04 (`DictationTrigger`, úroveň z `Recorder`).

## Rozsah

- `Bar/FlowBarPanel.swift` — `NSPanel` se `styleMask` `[.borderless, .nonactivatingPanel]`,
  `level = .statusBar`, `collectionBehavior` `[.canJoinAllSpaces, .fullScreenAuxiliary,
  .stationary, .ignoresCycle]`, bez stínu okna, průhledné pozadí, **`canBecomeKey = false`
  a `canBecomeMain = false`** — lišta nikdy nesmí vzít focus aplikaci, do které se vkládá.
  Umístění: obrazovka s kurzorem při začátku diktátu, vodorovně uprostřed, 12 px nad
  `visibleFrame.minY` (nad Dockem). Myš přijímá jen plocha pilulky.
- `Bar/FlowBarView.swift` (SwiftUI v `NSHostingView`) — stavy podle tabulky v plánu: klid,
  najetí myší, poslouchá, bez držení (Zrušit ×, Hotovo ■), zpracovává, hotovo, chyba.
  Přechody velikosti pružinou kolem 0,25 s, obsah se nepřeskládává.
- `Bar/DilkyMark.swift` — mřížka 2×2 se zaoblením jako v logu (rádius 28 % strany dílku),
  režimy: klid (bílé), úroveň (každý dílek svítí podle pásma hlasitosti), běh dokola
  (rozsvěcují se po směru hodinových ručiček, 600 ms), bliknutí.
- `Bar/Waveform.swift` — 16 svislých čar `navy-300`, výška z posledních úrovní, plynule.
- Klik na lištu v klidu = diktát bez držení; během něj Hotovo a Zrušit. Najetí myší ukáže
  „Podržte fn a mluvte" (podle zvolené zkratky „Podržte pravý ⌥…").
- **Omezit pohyb** (`NSWorkspace.shared.accessibilityDisplayShouldReduceMotion`): bez vlnek
  a běhu dokola, jen změna průhlednosti.
- Volby (UserDefaults, v Nastavení přepínač): „Ukazovat lištu v klidu" (výchozí ano).
  Když ne, lišta se ukáže jen při diktátu.
- Hlášky v liště (krátké, česky, podle `zakaziq-ux-texty-cs`): „V poli pro heslo diktování
  nejde", „Už nahráváte 9 a půl minuty", chybové stavy z VO06 připravené jako text.
- Prozatímní ukazatel z VO04 v ikoně menu odstraň nebo nech jen jako doplněk.

## Mimo rozsah

Odeslání a vložení (VO06). Okno aplikace (VO11).

## Testy

XCTest na mapování úrovní na pásma dílků a na výběr obrazovky a polohy (čistá funkce
z rámců obrazovek). `make test`.

## Ověření naostro

Spusť a projdi všechny stavy: klid, najetí, držení Fn s mluvením (vlnky reagují), dvojí Fn
(tlačítka), zpracování (zatím ho vyvolej ručně z ladicí položky menu, kterou pak schováš za
`#if DEBUG`). Ověř: lišta nad aplikací na celé obrazovce, na druhém monitoru, ve všech
plochách, **psaní v TextEditu během nahrávání se nepřeruší (focus zůstává)**, se zapnutým
„Omezit pohyb". Snímky obrazovky (`screencapture -x`) porovnej s náhledem a s Dílky.

## Hotovo, když

- Lišta vypadá jako náhled v barvách Dílků, nikdy nebere focus, reaguje na hlas.
- Klik spustí a zastaví diktát, najetí ukáže nápovědu.
- `make -C voice-mac test app` prošlo.

## Konec sezení

Skill `zakaziq-memory`. Stav VO05 v plánu. Commit `feat: voice lišta s dílky`.
