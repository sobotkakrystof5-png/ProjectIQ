# VO04 — Mac: Fn a nahrávání

> Sezení pro Claude Code na **MacBooku**, v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`.

## Cíl jednou větou

Podržením Fn se spustí nahrávání a puštěním skončí; dvojí stisk zapne diktát bez držení, Esc
zruší; nahrávka je soubor m4a s časem řeči, připravený k odeslání.

## Než začneš

1. Skill `zakaziq-memory` (začátek).
2. Plán `docs/admin/VOICE-PLAN.md` oddíly 2 (D-V6, D-V11), 3 (cesta diktátu, body 1–3), 13
   (rizika Fn). Kód z VO03 ve `voice-mac/`.

## Rozsah

- `Hotkey/FnMonitor.swift` — `CGEvent.tapCreate` na `flagsChanged` a `keyDown`:
  - Fn = `flagsChanged` s kódem klávesy 63 a příznakem `maskSecondaryFn` (dolů / nahoru).
    Šipky a F-klávesy na notebooku nesou `maskSecondaryFn` taky, proto rozhoduje kód 63.
  - Jiná klávesa při drženém Fn = uživatel chtěl zkratku → diktát zrušit.
  - Tap jako `.defaultTap` (je potřeba Zpřístupnění, to bude nutné na vkládání tak jako tak):
    **pohltí jen Esc**, a to jen během nahrávání a zpracování; všechno ostatní propouští.
  - Když macOS tap vypne (`tapDisabledByTimeout` / `ByUserInput`), znovu ho zapni. Zpětné
    volání musí být rychlé, práci posílej na hlavní frontu.
  - Záložní zkratka **pravý ⌥** (kód 61) se stejným chováním, volba v nastavení.
- `Hotkey/DictationTrigger.swift` — stavový automat (čistá logika, testovatelná bez systému):
  `idle → pressing → recording(hold | handsFree) → stopping`, pravidla: nahrávat **hned při
  stisku**, kratší než 0,3 s zahodit, dvakrát Fn do 0,4 s = bez držení, Fn znovu = konec,
  Esc = zrušit, nejvýš 10 min (v 9:30 upozornění, v 10:00 konec).
- `Audio/Recorder.swift` — `AVAudioRecorder`, AAC (`kAudioFormatMPEG4AAC`), 16 kHz, mono,
  asi 24–32 kbps, `isMeteringEnabled`; `prepareToRecord()` předem, ať se neztratí první
  slabika. Úroveň každých 50 ms pro lištu (VO05) a **čas řeči** (`speechMs` = součet úseků
  nad prahem, výchozí −40 dB, jako konstanta). Soubor v `~/Library/Application
  Support/ZakazIQ Voice/rec/` s právy 0600; po odeslání se maže (VO06).
- `Audio/Microphone.swift` — žádost o mikrofon (`AVCaptureDevice.requestAccess`), výchozí
  vstup systému.
- **Bezpečný vstup:** je-li `IsSecureEventInputEnabled()` při stisku Fn, nenahrávat a připravit
  hlášku „V poli pro heslo diktování nejde".
- **Výběr emoji na Fn:** přečti `com.apple.HIToolbox` → `AppleFnUsageType`; když není
  „Nic nedělat", ukaž v Nastavení větu a tlačítko do Nastavení systému → Klávesnice. Nic
  neměň sám.
- Prozatímní ukazatel: změna ikony v liště menu během nahrávání (lištu kreslí VO05).
- Kontext diktátu: aplikace vpředu při stisku (`NSWorkspace.frontmostApplication`: bundle id,
  název, pid), čas začátku, režim, délka, čas řeči.

## Mimo rozsah

Lišta (VO05), odeslání a vložení (VO06).

## Testy

XCTest na `DictationTrigger`: krátký stisk zahozený, držení, dvojí stisk, Esc, jiná klávesa
při Fn, limit 10 min, bezpečný vstup. Na `speechMs` z řady úrovní. `make test`.

## Ověření naostro

Spusť aplikaci, povol Mikrofon, Sledování vstupu a Zpřístupnění. Podrž Fn a mluv: ikona
v liště se změní, po puštění leží soubor m4a a přehraje se (`afplay`). Krátký stisk nic
nenahraje, Fn+F5 nic nespustí, Esc během nahrávání nezavře dialog v aplikaci vpředu,
v poli pro heslo (Safari) se nahrávání nespustí. Zapiš, co prošlo.

## Hotovo, když

- Fn, dvojí stisk, Esc a pravý ⌥ fungují podle plánu, výběr emoji neruší.
- Nahrávka je m4a 16 kHz mono se `speechMs`, první slabika se neztratí.
- `make -C voice-mac test app` prošlo.

## Konec sezení

Skill `zakaziq-memory`. Stav VO04 v plánu. Commit `feat: voice Fn a nahrávání na Macu`.
