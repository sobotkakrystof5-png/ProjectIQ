# ZakazIQ Voice — aplikace na Macu

Diktování do jakékoli aplikace: Mac nahrává, ukazuje a vkládá, přepis, čištění a učení
dělá server ZakazIQ (`/api/public/voice/*`). Plán a rozhodnutí: `docs/admin/VOICE-PLAN.md`
(R-150), technický popis: `docs/admin/AGENTS-ADMIN.md` → ZakazIQ Voice → Aplikace na Macu.

Stav: **VO03–VO06 a VO11 v kódu** — lišta menu, klávesa fn a nahrávání, lišta dole
uprostřed, odeslání, vložení, historie a fronta, okno jako Wispr Flow. Naostro na Macu
zatím neověřené (chybí podpisový certifikát, viz Podpis).

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
spustit znovu.

Pozor: spuštěná přímo z terminálu (`build/…/Contents/MacOS/ZakazIQVoice`) dědí oprávnění
terminálu nebo editoru. Skutečný stav ukáže jen spuštění přes `open` / `make run`.

## Diktování

- **Podržte fn** (nebo pravý ⌥, volba v Nastavení), mluvte, pusťte. **Dvakrát fn** = diktát bez
  držení, ukončí ho další fn, **Enter**, Hotovo na liště, nebo **10 s ticha**. Enter během nahrávání
  diktát jen ukončí, do aplikace (třeba Claude Code) nepropadne. **Esc** diktát zruší. Klik na lištu
  dole uprostřed spustí diktát bez držení.
- **Po diktátu** (Nastavení › Diktování): výchozí **Ukázat přepis** = nad lištou se ukáže karta
  s přepisem a tlačítkem **Zkopírovat**, nic se samo nevkládá (kurzor zůstane, kde byl, stačí ⌘V).
  Volba **Vložit text** vloží text tam, kde je kurzor.
- Když fn v systému otevírá výběr emoji nebo mění jazyk, Nastavení poradí, kde to vypnout
  (Nastavení systému › Klávesnice › Nedělat nic). Aplikace sama nic nemění.
- Když se mezitím přepne jiná aplikace, text se nevloží, jen se dá do schránky. Schránka
  se po vložení vrátí, jak byla.
- Bez sítě diktát počká ve frontě (nejdéle 24 h), přepíše se sám, ale **nevloží se**: lišta
  nabídne zkopírování a je v Historii. Menu: Zkopírovat poslední diktát, počet ve frontě.
- Nahrávka leží jen do odeslání v `~/Library/Application Support/ZakazIQ Voice/rec/`,
  historie a fronta v `voice.sqlite` tamtéž (práva 0600).

## Schůzky (R-151)

- Menu v liště nebo záložka **Schůzky** v okně → **Začít schůzku**. Nahrává se zvlášť mikrofon (vy)
  a zvuk počítače (druhá strana v Meetu, Zoomu, WhatsAppu), nejvýš 2 hodiny (upozornění 5 minut předem).
  Lišta ukazuje čas a tlačítko Ukončit. Během schůzky se nediktuje.
- Poprvé se macOS zeptá na **Nahrávání zvuku systému** (Soukromí a zabezpečení › Nahrávání obrazovky
  a zvuku systému). Potřebuje macOS 14.2 nebo novější.
- Promluvy odcházejí na server už během hovoru, takže po konci je přepis hned v okně: Zkopírovat přepis,
  Shrnout pomocí AI, Otevřít v adminu. Bez sítě čekají ve frontě (jen v paměti, do ukončení aplikace).
- Sluchátka pomůžou: bez nich mikrofon slyší druhou stranu i z reproduktorů (server takovou ozvěnu
  z přepisu vynechá, ale ne vždy).
- Nahrávky leží jen do odeslání v `~/Library/Application Support/ZakazIQ Voice/meet/<id>/`.
- **Nabídka u hovoru (R-152):** když Meet, Teams, Zoom, WhatsApp, FaceTime nebo prohlížeč začne používat
  mikrofon, objeví se nad lištou „Nahrát a přepsat schůzku?" (Nahrát schůzku / Teď ne). Po konci hovoru se
  zeptá „Hovor skončil?" a bez odpovědi nahrávání za 2 minuty ukončí. Název služby v prohlížeči (Google Meet)
  pozná z názvu okna přes Zpřístupnění. Vypnout: Nastavení › Schůzky › Nabízet nahrání hovoru.

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
  Net/                     VoiceClient, Dictate (meta, multipart, opakování), VoiceAPI (okno),
                           ConfigResponse, VoiceError + české hlášky
  Settings/                ServerAddress, DeviceKey, Klíčenka (SecretStore), Preferences
  Dictation/               DictationTrigger (fn, dvojí stisk, Esc, Enter, 10 s ticha, limity), Shortcut,
                           PastePlan, AfterDictation (ukázat přepis / vložit)
  Audio/                   SpeechMeter (čas řeči, hlasitost)
  Bar/                     BarLayout (velikosti a poloha lišty), TranscriptLayout (karta s přepisem)
  Store/                   LocalDB (historie a fronta, SQLite)
  Hub/                     čísla, formát a historie pro okno
  Meeting/                 TurnSegmenter (promluvy podle pauz), MeetingAPI (schůzky na serveru)
Sources/ZakazIQVoice/      aplikace (AppKit + SwiftUI)
  App/                     main, AppDelegate (menu, lišta, okno), AppModel
  Hotkey/                  FnMonitor (CGEventTap)
  Audio/                   Recorder (m4a 16 kHz mono)
  Bar/                     lišta dole uprostřed (NSPanel + SwiftUI)
  Meeting/                 schůzka: zvuk počítače (Core Audio tap), mikrofon, promluvy, fronta
  Transcript/              karta s přepisem nad lištou a tlačítkem Zkopírovat
  Paste/                   Paster (⌘V a vrácení schránky)
  Dictation/               DictationController, LocalHistorySource
  Window/                  okno: Domů, Historie, Slovník, Styl, Nastavení
  Brand/                   barvy a písma Dílků, mřížka 2×2, logo
  Permissions/             mikrofon, sledování vstupu, zpřístupnění
Tests/ZakazIQVoiceTests/   Swift Testing + Fixtures/config-ok.json
```

Ladicí sestavení (`make app CONFIG=debug SIGN_ID=-`) umí s proměnnou
`ZAKAZIQ_VOICE_BAR_SNAPSHOT=/cesta.png` vykreslit všechny stavy lišty a karty s přepisem a skončit,
s `ZAKAZIQ_VOICE_TRANSCRIPT_SNAPSHOT=/cesta.png` dlouhou kartu ve skutečném okně, s
`ZAKAZIQ_VOICE_SNAPSHOT=/cesta.png` vykreslit okno do PNG (kontrola vzhledu bez oprávnění
Nahrávání obrazovky). Ve vydaném sestavení to není.
