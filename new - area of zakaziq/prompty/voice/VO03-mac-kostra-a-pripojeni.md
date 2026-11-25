# VO03 — Mac: kostra aplikace, značka, oprávnění, připojení

> Sezení pro Claude Code na **MacBooku**, v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`.

## Cíl jednou větou

Aplikace ZakazIQ Voice se sestaví příkazem `make`, běží v liště menu s ikonou dílků, umí si
říct o oprávnění, uloží klíč zařízení do Klíčenky a ověří připojení k serveru.

## Než začneš

1. Skill `zakaziq-memory` (začátek), `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
2. Plán `docs/admin/VOICE-PLAN.md` oddíly 2 (D-V5, D-V13), 7 (kontrakt), 9 (barvy, logo).
3. Z VO00 v plánu: verze macOS, Swift, Xcode a jakou podpisovou identitu Kryštof vytvořil.
   Neexistuje-li ještě, proveď ho krokem (Klíčenka → Certificate Assistant → Create a
   Certificate, typ Code Signing, název „ZakazIQ Voice vývoj"); dělá to Kryštof.

## Rozsah

Složka `voice-mac/` v kořeni repa:

```
voice-mac/
  Package.swift            Swift 5 language mode, macOS 14, jeden executable target, testy
  Makefile                 build, test, app, install, run, clean
  README.md                jak sestavit, podepsat, jaká oprávnění a proč
  Resources/
    Info.plist             cz.zakaziq.voice, LSUIElement, NSMicrophoneUsageDescription,
                           NSAppTransportSecurity → NSAllowsLocalNetworking (localhost)
    AppIcon.icns           z public/ikony/ikona-512.png (sips + iconutil v Makefile)
    Fonts/                 Instrument Sans, JetBrains Mono + OFL.txt (z github.com/google/fonts,
                           složky ofl/instrumentsans a ofl/jetbrainsmono; licenci přibal)
  Sources/ZakazIQVoice/
    App/                   vstup, AppDelegate, ikona a menu v liště
    Brand/                 barvy Dílků (hex z plánu), písma, kreslení mřížky 2×2
    Settings/              Klíčenka (klíč zařízení), UserDefaults (adresa serveru, volby)
    Permissions/           Mikrofon, Sledování vstupu, Zpřístupnění: stav a otevření Nastavení
    Net/                   VoiceClient (URLSession, GET /config), modely odpovědí
  Tests/ZakazIQVoiceTests/ XCTest
```

- **Ikona v liště menu:** 2×2 dílky jako šablonový obrázek (kreslí `Brand/`), menu:
  Diktovat (zatím vypnuté), Otevřít ZakazIQ Voice (zatím okno Nastavení), Vyzkoušet
  připojení, Ukončit.
- **Jednoduché okno Nastavení** (SwiftUI, Dílky): adresa serveru (výchozí
  `https://www.zakaziq.cz`, vývoj `http://localhost:3000`), klíč zařízení (vložit, zakrytý,
  Smazat), **Vyzkoušet připojení** (`GET /config` → „Připojeno k zařízení MacBook" / česká
  hláška podle `code`), oprávnění se stavem a tlačítkem do Nastavení systému.
- **Klíč** jen v Klíčence (`kSecClassGenericPassword`, služba `cz.zakaziq.voice`), nikdy
  v UserDefaults ani v logu. Adresa musí být `https://` (výjimka jen `localhost`); apex
  `zakaziq.cz` aplikace přepíše na `www` (přesměrování by ztratilo klíč).
- **Podpis:** `make app` sestaví `build/ZakazIQ Voice.app` a podepíše ho identitou z
  proměnné `SIGN_ID` (výchozí „ZakazIQ Voice vývoj"). Stálá identita = macOS si pamatuje
  oprávnění i po novém sestavení. `make install` zkopíruje do `~/Applications`.
- `.gitignore`: `voice-mac/.build/`, `voice-mac/build/`.

## Mimo rozsah

Fn, nahrávání (VO04), lišta (VO05), vkládání (VO06), velké okno (VO11).

## Testy

XCTest: přepis apex adresy na www, odmítnutí `http://` mimo localhost, mapování kódů chyb
na české hlášky, dekódování odpovědi `/config` z ukázkového JSON. `make test` musí projít.

## Ověření naostro

`make install`, spusť aplikaci: ikona v liště, okno Nastavení, Kryštof vloží klíč z adminu
(VO01, lokální admin proti testovacímu Neonu) a Vyzkoušet připojení proti `npm run dev`
ukáže název zařízení. Nové sestavení (`make install` znovu) nesmí vyžadovat nové povolení
oprávnění. Vzhled okna porovnej s Dílky. Co nešlo, napiš.

## Hotovo, když

- `make -C voice-mac test app` projde bez varování podpisu.
- Aplikace běží v liště, ověří připojení a klíč leží jen v Klíčence.
- `voice-mac/README.md` popisuje sestavení, podpis a oprávnění.
- `docs/admin/AGENTS-ADMIN.md` → ZakazIQ Voice: oddíl „Aplikace na Macu" (struktura, sestavení).

## Konec sezení

Skill `zakaziq-memory` (rozhodnutí o podpisu do R-148 jako upřesnění, je-li jiné než plán).
Stav VO03 v plánu. Commit `feat: voice aplikace na Macu, kostra a připojení`.
