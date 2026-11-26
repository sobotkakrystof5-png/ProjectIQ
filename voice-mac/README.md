# ZakazIQ Voice — aplikace na Macu

Diktování do jakékoli aplikace: Mac nahrává, ukazuje a vkládá, přepis, čištění a učení
dělá server ZakazIQ (`/api/public/voice/*`). Plán a rozhodnutí: `docs/admin/VOICE-PLAN.md`
(R-148), technický popis: `docs/admin/AGENTS-ADMIN.md` → ZakazIQ Voice → Aplikace na Macu.

Stav: **VO03** — aplikace v liště menu, okno Nastavení (adresa serveru, klíč zařízení,
Vyzkoušet připojení, oprávnění). Klávesa Fn a nahrávání přibudou ve VO04.

## Co je potřeba

- macOS 14 nebo novější, Swift 6 (stačí Command Line Tools: `xcode-select --install`).
- Žádné cizí balíčky, jen Apple frameworky.
- Podpisová identita v Klíčence (jednou, viz níž).

## Sestavení

```sh
make -C voice-mac test      # testy (Swift Testing; XCTest v Command Line Tools není)
make -C voice-mac app       # build/ZakazIQ Voice.app, podepsaná
make -C voice-mac install   # do ~/Applications (běžící verzi ukončí)
make -C voice-mac run       # install + spustí
make -C voice-mac icon      # znovu vykreslí Resources/AppIcon.icns (Scripts/AppIcon.swift)
```

Aplikace je jen v liště menu (ikona 2×2 dílky), v Docku není. Bez uloženého klíče se
po spuštění sama otevře okno Nastavení.

## Podpis: proč a jak

macOS si oprávnění (mikrofon, sledování vstupu, zpřístupnění) a přístup ke Klíčence pamatuje
podle podpisu aplikace. Podpis „ad hoc" se mění s každým sestavením, takže by se po každém
`make install` musela povolení dávat znovu. Proto se podepisuje **stálou vlastní identitou**.

Vytvoření (jednou, asi minuta):

1. Otevřete **Přístup ke klíčenkám** (Keychain Access).
2. Menu **Přístup ke klíčenkám → Asistent certifikátů → Vytvořit certifikát…**
3. Název `ZakazIQ Voice vývoj`, typ identity **Kořenový podepsaný sám sebou**
   (Self Signed Root), typ certifikátu **Podepisování kódu** (Code Signing) → Vytvořit.

„Vždy důvěřovat" nastavovat nemusíte: `codesign` nedůvěryhodný vlastní certifikát přijme
a macOS si aplikaci pamatuje podle otisku certifikátu (`certificate leaf = H"…"`), ne podle
sestavení (ověřeno 2026-11-26). Při prvním podpisu se macOS zeptá, jestli `codesign` smí
klíč použít: zadejte heslo k Macu a zvolte **Vždy povolit**.

- Jiný název certifikátu: `make app SIGN_ID="Můj certifikát"` (nebo jeho otisk SHA-1).
- Na zkoušku bez certifikátu: `make app SIGN_ID=-` (ad hoc; oprávnění se po dalším sestavení ztratí).
- Podpis má hardened runtime a jediné oprávnění `com.apple.security.device.audio-input`
  (`Resources/ZakazIQVoice.entitlements`); bez něj by systém mikrofon tiše odmítl.
- Notarizace a Developer ID nejsou potřeba, aplikace běží jen na vlastním Macu.

## Oprávnění

| Oprávnění | Proč | Kdy se poprvé použije |
|---|---|---|
| Mikrofon | nahrávání diktátu | VO04 |
| Sledování vstupu | podržení klávesy Fn | VO04 |
| Zpřístupnění | vložení textu do aktivní aplikace (⌘V) a čtení opravy | VO06, VO09 |

V okně Nastavení je u každého stav a tlačítko **Povolit** (systémový dotaz) nebo
**Otevřít Nastavení** (přímo na správné místo v Nastavení systému). Stav se při otevřeném
okně obnovuje každou vteřinu a půl. Po povolení Sledování vstupu může být potřeba aplikaci
spustit znovu (týká se až VO04).

Pozor: spuštěná přímo z terminálu (`build/…/Contents/MacOS/ZakazIQVoice`) dědí oprávnění
terminálu nebo editoru. Skutečný stav ukáže jen spuštění přes `open` / `make run`.

## Připojení

- **Adresa serveru** (`UserDefaults`, klíč `serverAddress`): výchozí `https://www.zakaziq.cz`,
  vývoj `http://localhost:3000`. Jen `https://`, výjimka `localhost`, `127.0.0.1`, `::1`
  (`NSAllowsLocalNetworking` v `Info.plist`). Apex `zakaziq.cz` se přepíše na `www`:
  apex přesměrovává a klíč by se cestou ztratil. Přesměrování aplikace nesleduje vůbec.
- **Klíč zařízení** (`zk_voice_…`, vytvoří admin v ZakazIQ Voice › Zařízení) leží jen
  v Klíčence: obecné heslo, služba `cz.zakaziq.voice`, účet `device-key`, jen na tomto Macu.
  Nikdy v `UserDefaults`, v logu ani v hlášce; v okně se ukazuje zakrytý (`zk_voice_abcd…`).
  Smazaný klíč jde 8 s vrátit.
- **Vyzkoušet připojení** = `GET /api/public/voice/config` s `Authorization: Bearer …`, bez
  cookie, cache a hlavičky `Origin`. Výsledek „Připojeno k zařízení MacBook", jinak česká
  hláška podle kódu chyby (`VoiceMessages`).

## Struktura

```
Package.swift              Swift 6 nástroje, jazykový režim 5, macOS 14
Makefile                   test, build, app, sign, install, run, icon, clean
Resources/                 Info.plist, entitlements, AppIcon.icns, Fonts/ (Instrument Sans,
                           JetBrains Mono, licence OFL)
Scripts/AppIcon.swift      vykreslí ikonu ze stejné geometrie jako public/ikony/ikona.svg
Sources/ZakazIQVoiceCore/  logika bez rozhraní (testovaná)
  Net/                     VoiceClient, ConfigResponse, VoiceError + české hlášky
  Settings/                ServerAddress, DeviceKey, Klíčenka (SecretStore), Preferences
Sources/ZakazIQVoice/      aplikace (AppKit + SwiftUI)
  App/                     main, AppDelegate (lišta menu, okno), AppModel
  Brand/                   barvy a písma Dílků, mřížka 2×2, logo
  Permissions/             mikrofon, sledování vstupu, zpřístupnění
  Settings/                okno Nastavení
Tests/ZakazIQVoiceTests/   Swift Testing + Fixtures/config-ok.json
```

Ladicí sestavení (`make app CONFIG=debug SIGN_ID=-`) umí s proměnnou
`ZAKAZIQ_VOICE_SNAPSHOT=/cesta.png` vykreslit okno do PNG (kontrola vzhledu bez oprávnění
Nahrávání obrazovky). Ve vydaném sestavení to není.
