# Z klientského prostoru k platícímu zákazníkovi ZakazIQ — analýza a plán

> **Stav:** 2026-11-21 rozhodnuto D-KV1–D-KV9 (oddíl 9, `memory/memory.md` R-134 a R-135). V kódu je jen KV01a (landing s formulářem „Chci to vyzkoušet“, na produkci od 2026-11-21, `1e3c993`); zbytek v kódu není. Sezení KV00 je tím hotové. Admin se v dalších sezeních mění jen s výslovným zadáním
> (AGENTS.md → Hranice v repu).
>
> **Otázka:** jak z klienta, kterému Kryštof staví web a který má klientský prostor `/klient`, udělat
> platícího uživatele ZakazIQ Workspace (249 Kč měsíčně).

## 0. Shrnutí

1. **Dnes zaplatit nejde.** Tlačítko „Vyzkoušet 14 dní zdarma" na www.zakaziq.cz vede na registraci
   vývojové instance Clerku (na stránce je nápis *Development mode*, ověřeno 2026-11-21) a Stripe je
   podle paměti jen v sandboxu. Bez toho nemá smysl ladit psychologii (oddíl 1.3, B1).
2. **Klientský prostor a Workspace o sobě nevědí.** Jiné přihlášení (Supabase × Clerk), jiná data
   (`portal` × `ws`), v `/klient` není jediný odkaz na Workspace (B3).
3. **Po předání webu klient nemá důvod se vracet.** Prostor je postavený kolem rozpracované zakázky;
   když je hotová, zbude seznam „Hotové" a faktury (B5).
4. **Nejsilnější argument už máte v ruce: zrcadlo.** Klient u vás zažil rezervaci konzultace ve volném
   čase, potvrzení e-mailem, etapy zakázky, fakturu s QR kódem a dotazník. Přesně tohle dá Workspace
   jeho zákazníkům. Nabídka nemusí nic slibovat, stačí ukázat: „Takhle jste to měli u mě. Takhle to můžou
   mít vaši zákazníci u vás." (oddíl 2.5)
5. **Prodávat nejdřív osobně, automatizovat až potom.** Klientů s webem je málo a Kryštofovi věří.
   Prvních 3–5 převede rozhovor a nastavení spolu líp než jakýkoli automat. Kód má Kryštofovi
   pomáhat: najít kandidáty, připravit Workspace jedním klikem, připomenout se ve správnou chvíli.

## 1. Kontrola od A do Z (k 2026-11-21)

### 1.1 Co jsem dnes skutečně ověřil

| Kontrola | Výsledek |
|---|---|
| `npx tsc --noEmit` | prošlo bez chyby |
| `npx vitest run` | 1572 prošlo, 3 přeskočené, **3 selhaly** — všechny známé z paměti: `ws-schema` (mezera v číslování po 120), `ws-email` (test s pevným datem z listopadu), `admin-ai-asistent-crm` (časový limit 5 s při zakládání PGlite pod zátěží) |
| `https://zakaziq.cz/` | 308 na `https://www.zakaziq.cz/`, canonical míří na www (R-075 sedí) |
| Landing page | 200, text sedí s R-078 a cenou 249 Kč; hlavní akce „Vyzkoušet 14 dní zdarma" → `/w/registrace` |
| `/w/registrace` | 200, konzole bez chyb, **Clerk v režimu *Development mode*** |
| `/klient/prihlaseni` | 200 |

Klíč Stripe na produkci jsem neověřoval (hodnoty env proměnných nečtu). Podle paměti je Stripe jen
v sandboxu.

### 1.2 Funkce po oblastech

Stav: **naživo** = někdo to na produkci prošel, **testy** = jen testy nebo Preview, **blokuje** =
nejde použít naostro.

| Oblast | Funkce | Stav | Poznámka |
|---|---|---|---|
| Landing | stránka, ceník, dotazy, kontaktní formulář do Hovorů | naživo (stránka), testy (formulář) | text pravdivý, bez vymyšlených čísel |
| Landing | „Vyzkoušet 14 dní zdarma" | **naživo** | do 2026-11-21 vedlo do registrace vývojové instance Clerku; od KV01a (`1e3c993`) vede na formulář „Chci to vyzkoušet" |
| Workspace | registrace, průvodce Nový byznys, šablony 8 oborů | testy + Preview 2026-10-31 | krok 2 je Stripe Checkout s kartou (R-038) |
| Workspace | předplatné, zkušební doba, jen čtení po zrušení | testy | Stripe live chybí, webhook na produkci není |
| Workspace | Dnes, Poptávky, Kalendář, Zákazníci, věrnost, Zakázky | Preview 2026-10-31 | s přihlášením na skutečných datech jen částečně |
| Workspace | faktury s PDF a QR, příjmy, odhad daní | Preview (PDF s QR 200) | vzhled PDF okem neověřen |
| Workspace | objednávací stránka `/r`, widget, API v1 | testy | `/r` funguje jen pro účet s dokončeným Checkoutem (R-077) — na produkci takový není |
| Workspace | e-maily zákazníkům a majiteli (20 typů, přehledy dne/týdne/měsíce) | testy | doručení naostro nikdo nezkusil |
| Workspace | **e-maily majiteli o zkušební době a začátcích** | **neexistují** | jen připomínka Stripe 7 dní předem, pokud je zapnutá (R-038) |
| Workspace | checklist „Začněte" na Dnes | testy | tři kroky, zmizí po první poptávce |
| Workspace | GDPR export, výmaz, zrušení účtu, PWA | testy + Preview (export, výmaz) | |
| Klientský prostor | pozvánka, heslo, obnova hesla e-mailem | **naživo** 2026-11-21 | |
| Klientský prostor | Přehled „Čeká na vás", chat s přílohami a hlasem, etapy a „Mám hotovo" | testy | na produkci od 2026-11-21, pilot s klientem neproběhl |
| Klientský prostor | peníze a faktury s PDF a QR, konzultace z volna s Google Meet | testy | Meet ani doručení naživo nikdo nezkusil |
| Klientský prostor | hodnocení přes dotazník R-119, poptávky z webu klienta (jen počet) | testy | žádný web klienta zatím napojený není |
| Klientský prostor | **cokoli o Workspace** | **neexistuje** | žádný odkaz, nabídka ani propojení |
| Admin | modernizace AD00–AD18, kontakty, faktury, asistent, Hovory, AI asistent | naživo (část) | za přihlášením na produkci prošlo málo; admin nemá druhý faktor |
| Admin | „Pozvat klienta" do Workspace (S17) | testy | založí účet a byznys ze šablony, pozvánku pošle Clerk; naostro neprošlo |

### 1.3 Zjištění, která mění plán

- **B1 — Registrace na produkci nejde dokončit naostro.** Návštěvník landing page skončí na
  přihlašovací stránce s nápisem *Development mode*. To samo o sobě srazí důvěru, ještě než zadá
  e-mail. Je-li ve Vercel Production opravdu testovací klíč Stripe, platí navíc: skutečná karta se
  odmítne, a kdo zná testovací kartu Stripe, založí si na produkční databázi předplatné, které nic
  nestojí. **Ověřit klíč ve Vercelu.** Rozhodnuto (D-KV2): Workspace se spustí až na Supabase
  a do té doby vede hlavní akce landing page na formulář „Chci to vyzkoušet" místo registrace.
- **B2 — Vercel Hobby a placený SaaS (R-133).** Podle podmínek Vercelu je Hobby jen pro nekomerční
  použití. Ve chvíli, kdy první klient zaplatí 249 Kč, je provoz komerční. Rozhodnuto (D-KV8, R-135):
  při prvním platícím klientovi přesun na Cloudflare, dopředu se nepřipravuje.
- **B3 — Dva oddělené světy.** Klient se do prostoru přihlašuje přes Supabase, do Workspace by musel
  přes Clerk s novým účtem. Každý další účet a heslo je místo, kde lidé odpadnou. R-107 už rozhodlo,
  že Workspace přejde na Supabase (fáze F2) — potom stačí jedno přihlášení na obojí.
- **B4 — Zkušební doba běží potichu.** Workspace majiteli neříká, kolik dní zbývá, co za ni udělal,
  ani mu nepomůže k první poptávce. Pro konverzi jsou to nejdůležitější dny.
- **B5 — Útes po předání.** Motivace klienta je nejvyšší při spuštění webu a pak spadne. Prostor
  k tomu nemá nic: žádné „web je venku", žádné výsledky webu, pokud web není napojený, žádný další krok.

## 2. Kdo je klient a co si myslí

### 2.1 Profil

Majitel malé služby (kadeřnictví, kosmetika, zámečník, studnař, autoservis, úklid, řemesla). Firmu
vede sám nebo s pár lidmi, většinu dne pracuje rukama, telefon má v kapse a diář na pultu.
S počítačem umí tolik, kolik musí. Od Kryštofa si koupil web, takže už mu jednou svěřil peníze
a viděl výsledek.

Nekupuje „software". Chce plný kalendář, méně telefonování a mít přehled o penězích. Web je pro něj
prostředek, ne cíl — a ZakazIQ taky.

Klienti s e-shopem, designem nebo automatizací tenhle profil mít nemusí. Workspace stojí na
termínech a zakázkách; komu nepřinese užitek, tomu ho nenabízet (D-KV6).

### 2.2 Cesta klienta dnes

```
motivace
  ▲
  │            ┌─ spuštění webu (vrchol)
  │           ╱ ╲
  │   stavba ╱   ╲
  │  ───────╱     ╲___ faktura ___ dotazník ____________________ ticho
  │ poptávka                                       (sem patří nabídka
  │                                                 i vracecí smyčky)
  └────────────────────────────────────────────────────────────────► čas
```

Dnes prostor dobře slouží během stavby: „Čeká na vás" říká, co je potřeba, postup v procentech
ukazuje, že se něco děje, peníze jsou průhledné a chat má přečteno jako WhatsApp. To všechno snižuje
nejistotu a buduje důvěru. Po spuštění ale klient nemá proč se vracet.

Dvě výhody, které už máte a nevyužíváte:

- **Značka je mu známá.** V levém horním rohu prostoru je logo ZakazIQ. Klient ho týdny vídal jako
  „místo, kde vidím svůj web". Známé věci se lidem zdají bezpečnější.
- **Vzhled je mu známý.** Prostor i Workspace jsou v Dílkách. Kdo prošel prostorem, nebude se ve
  Workspace cítit ztracený.

### 2.3 Co ho brzdí

| Bariéra | Jak zní v hlavě | Čím ji snížit |
|---|---|---|
| Zvyk | „Diář mi funguje." | ukázat konkrétní chvíli, kdy nefunguje, jeho vlastními čísly z webu |
| Strach ze složitosti | „Na tohle nemám čas, neumím to." | připravený systém a 15 minut nastavení spolu s Kryštofem |
| Další předplatné | „Zase platit každý měsíc." | cena vedle ceny jeho vlastní služby; zrušení jedním klikem |
| Karta na začátku | „Zapomenu zrušit a strhnou mi to." | poctivá připomínka před první platbou, ve Workspace i e-mailem |
| Ztráta kontroly nad daty | „Kdo uvidí moje zákazníky?" | krátká odpověď a odkaz na ochranu údajů; export dat kdykoli |
| Špatné načasování | „Teď řeším spuštění webu." | nabídnout až po první poptávce z webu, ne v den předání |
| Identita | „Jsem kadeřnice, ne ajťák." | mluvit o zákaznících a kalendáři, ne o „systému" a „funkcích" |

### 2.4 Co ho táhne a jak to použít poctivě

Rámec: člověk něco udělá, když má **chuť**, **jde to snadno** a **přijde podnět ve správnou chvíli**
(Foggův model chování). Chuť dodá jeho vlastní výsledek webu, snadnost připravený systém a osobní
pomoc, podnět okamžiky z oddílu 3.4.

| Princip | Použití v ZakazIQ | Hranice |
|---|---|---|
| **Důvěra k člověku** (Cialdini: sympatie, autorita) | nabídka od Kryštofa jeho jménem a hlasem, ne od „týmu ZakazIQ" | žádné vymyšlené tituly ani ocenění |
| **Reciprocita** | nastavení zdarma, systém připravený předem | dar bez podmínky, nikdy „něco jste mi dlužní" |
| **Efekt vlastnictví** | Workspace už má jeho služby, otevírací dobu a napojený web; na konci zkušební doby rekapitulace „tohle máte v ZakazIQ" | jen skutečná data; po zrušení zůstanou a jdou stáhnout (je to pravda: R-054, R-074) |
| **Rozběhnutý pokrok** (endowed progress) | checklist začne na „2 ze 3", protože Kryštof služby a web opravdu nastavil | odškrtnout jen to, co je hotové |
| **Malá ano** (konzistence) | výsledky webu → ukázka → konzultace → zkušební doba → placení | každý krok jde odmítnout stejně snadno jako přijmout |
| **Averze ke ztrátě** | „Poptávky teď máte v e-mailu. V ZakazIQ je máte v kalendáři." | žádné „přicházíte o zákazníky" ani odhad ztrát, který nemáme |
| **Vrchol a konec** | nabídka u první poptávky z webu a po hodnocení 9–10 | nespojovat s žádostí o recenzi na Googlu na jedné obrazovce |
| **Kotva** | 249 Kč vedle ceny jeho nejlevnější služby; „asi 8 Kč denně" | žádný slib návratnosti |
| **Výchozí volba** | nový web je od začátku připravený na ZakazIQ (oddíl 5.4) | nic nezapínat bez souhlasu klienta |
| **Proměnlivá odměna** (Hook) | měsíční číslo poptávek z webu — pokaždé jiné, proto ho lidé otevřou | jen užitečná informace, strop frekvence |
| **Sociální důkaz** | „Používá to i [firma] z vašeho oboru" | až po souhlasu skutečného klienta; do té doby nic |
| **Nový začátek** | nabídka první den v měsíci nebo před sezónou oboru | žádné vymyšlené termíny |
| **Skutečný nedostatek** | osobní nastavení stojí Kryštofa čas, a ten je omezený | jen když to Kryštof tak opravdu dělá; žádné odpočítávání |
| **Odvrácení rizika** | „Zrušíte jedním klikem. Poptávky z webu vám pak dál chodí e-mailem a data si stáhnete." | musí platit doslova |

### 2.5 Hlavní myšlenka: zrcadlo

Klient nemusí věřit slibům. Celé týdny zažíval, jak se k zákazníkovi chová firma, která má ZakazIQ.

| Zažili jste u mě v prostoru | Vaši zákazníci dostanou od vás ve Workspace |
|---|---|
| konzultaci jste si zarezervovali ve volném čase, bez telefonování | objednají se na webu, přes odkaz nebo QR kód na pultu (`/r`, widget) |
| přišlo potvrzení e-mailem s časem | potvrzení termínu, změna i připomínka den předem (`booking_confirmed`, `reminder`) |
| viděli jste etapy a co je hotové | zakázky s vlastními stavy a stránka zakázky pro zákazníka (`/z/[token]`, `job_update`) |
| faktura s QR kódem, zaplaceno jedním naskenováním | faktura s QR platbou |
| po dokončení jste dostali krátký dotazník | poděkování po návštěvě a věrnostní karta s razítky |

Tabulka odpovídá tomu, co v kódu je (`lib/ws/email/catalog.ts`, R-045, R-051, R-061). Nic z ní
není slib navíc.

## 3. Strategie

### 3.1 Cíl a hlavní číslo

**Hlavní číslo:** počet klientů webu, kteří mají Workspace a platí. Ne počet registrací.

**Aktivace** (okamžik „aha"): první skutečná poptávka, kterou klient ve Workspace potvrdil. Kdo ji
zažije během zkušební doby, má důvod platit. Kdo ne, zruší, ať je nabídka jakkoli dobrá.

Cíle v číslech zatím nedávám. Vymyšlená čísla jsou v projektu zakázaná a srovnávací data pro
malé české firmy nemáme. Cíl se nastaví po pilotu: **[DOPLNIT po prvních 5 klientech]**.

### 3.2 Trychtýř

| Krok | Kdy je splněný | Odkud číslo |
|---|---|---|
| 1. Spuštěný web | zakázka typu web ve stavu Hotovo | `projects` |
| 2. Výsledky webu | web posílá události (KP17) | `project_web_events` |
| 3. Viděl nabídku | karta nebo stránka v prostoru zobrazená | `portal.member_prompts` (nová, KV03) |
| 4. Rozhovor | domluvená konzultace s tématem ZakazIQ | `consultation_slots` |
| 5. Zkušební doba | účet Workspace s předplatným ve zkušební době | `ws.subscriptions`, zdroj účtu (KV02) |
| 6. Aktivace | první potvrzená poptávka ve Workspace | `ws.requests` |
| 7. Platí | předplatné aktivní po zkušební době | `ws.subscriptions` |
| 8. Zůstal | platí i třetí měsíc | `ws.subscriptions` |

Všechno jde spočítat z databáze. Měřicí skripty třetích stran ani sledovací cookies nejsou potřeba.

### 3.3 Žebřík malých ano

1. **Podívat se** — výsledky webu v prostoru (nic nestojí, nic se neslibuje).
2. **Zajímat se** — „Co dál s poptávkami?" otevře stránku Pro vaši firmu.
3. **Mluvit** — „Nastavíme to spolu" domluví 20minutovou konzultaci (funkce už existuje, KP14).
4. **Zkusit** — Kryštof při konzultaci ukáže připravený Workspace a klient spustí zkušební dobu.
5. **Použít** — první poptávka přijde do kalendáře a klient ji potvrdí.
6. **Zůstat** — konec zkušební doby s rekapitulací; pokračování nevyžaduje žádnou akci, zrušení jedno kliknutí.

Každý krok má vedle sebe stejně viditelné „Teď ne".

### 3.4 Kdy nabízet

| Okamžik | Proč tehdy | Co se stane |
|---|---|---|
| **První poptávka z webu** | vrchol: web poprvé přinesl zákazníka | e-mail „Váš web přinesl první poptávku" (bez nabídky) a v prostoru karta s nabídkou |
| **Hodnocení 9–10** | klient je spokojený a řekl to nahlas | o 3 dny později karta v prostoru; na děkovné obrazovce zůstává jen recenze na Googlu |
| **Měsíční výsledky** | nové číslo, nový začátek měsíce | e-mail s čísly (servisní), nabídka jen v prostoru |
| **Před sezónou oboru** | kadeřnictví před Vánoci, studnaři na jaře | osobní zpráva od Kryštofa, jednou ročně |
| **Nikdy** | v den předání, u faktury, po hodnocení 0–6, po „Nezajímá mě" | — |

Den předání záměrně ne: klient řeší spuštění a nemá ještě žádnou poptávku, kterou by šlo ukázat.

### 3.5 Kanály podle síly

1. **Osobně** (konzultace, telefon). Nejsilnější. Scénář v oddílu 7.
2. **V prostoru** (karty, stránka Pro vaši firmu). Klient tam chodí sám, nic neobtěžuje.
3. **E-mailem** jen servisní informace (výsledky webu) a nabídka jen se souhlasem (D-KV5).
4. **V adminu** seznam kandidátů, aby Kryštof věděl, komu a proč zavolat.

### 3.6 Nabídka

Co klient dostane (rozhodnuto D-KV3 a D-KV4, R-134):

- ZakazIQ připravený předem: jeho firma, obor, služby, otevírací doba, napojený web.
- 20 minut nastavení s Kryštofem přes Google Meet (konzultace, kterou si zarezervuje sám).
- Zkušební dobu **30 dní** místo 14. Web malé firmy přinese za 14 dní jen pár poptávek a klient
  nemusí stihnout zažít aktivaci. Cena zůstává 249 Kč, bez slevy.
- Jistotu: zrušení jedním klikem, data ke stažení, poptávky z webu mu dál chodí e-mailem.

Slevu na cenu nedoporučuji: kotví hodnotu níž a PRODUCT.md slevy nezná. Delší zkušební doba je
dárek, který nestojí nic a přímo míří na aktivaci.

### 3.7 Komu nabídku ukázat

Proaktivně (karty, e-mail, telefon) jen klientům, kteří splní všechno:

- mají hotový web od Kryštofa,
- Kryštof je v adminu označil jako vhodný obor (služba s termíny nebo zakázkami),
- nedali hodnocení 0–6 (nejdřív napravit vztah),
- neřekli „Nezajímá mě" a nemají odklad „Teď ne".

Tichá položka v menu prostoru „Pro vaši firmu" je vidět všem s hotovým webem a vhodným oborem.

## 4. Vracecí smyčky

Každá smyčka má podnět, akci, odměnu a malou investici, díky které se příště vrátí (model Hook,
N. Eyal). Odměna musí být pro klienta užitečná sama o sobě, ne návnada.

| Smyčka | Podnět | Akce | Odměna | Investice | Strop |
|---|---|---|---|---|---|
| **První poptávka z webu** | první událost z webu (KP17) | otevře prostor | „můj web funguje" | — | jednou za život webu |
| **Měsíční výsledky webu** | e-mail 1. dne v měsíci | podívá se na graf | nové číslo a srovnání s minulým měsícem | — | 1× měsíčně, jde vypnout |
| **Rok vašeho webu** | výročí spuštění | otevře shrnutí | poptávky za rok, nejsilnější měsíc | — | 1× ročně |
| **Chat jako podpora webu** | potřebuje něco na webu změnit | napíše do chatu | rychlá změna, přečteno jako WhatsApp | historie požadavků | — |
| **Údržba a faktury** | pravidelná faktura za údržbu (R-117) | zaplatí QR kódem | hotovo za minutu | — | podle smlouvy |
| **Kontrola před sezónou** | osobní zpráva od Kryštofa | domluví konzultaci | web připravený na sezónu | čas s Kryštofem | 1× ročně |
| **Po konverzi** | přehled dne/týdne/měsíce Workspace (už existuje) | otevře Workspace | přehled poptávek a peněz | data zákazníků | podle nastavení |

Dvě věci k chatu: zarámovat ho po předání jako „Podpora vašeho webu" (jedna věta v prázdném stavu
a v hlavičce hotové zakázky) a v Přehledu ukazovat i hotovou zakázku s webem nahoře, ne jen v seznamu
„Hotové". Prostor se tím z archivu stane místem, kam se chodí.

## 5. Co postavit

### 5.1 Klientský prostor

| # | Prvek | Kde | Poznámka |
|---|---|---|---|
| P1 | Karta **„Váš web je venku"** | Přehled, po stavu Hotovo u zakázky s webem | oslava a tři kroky: výsledky webu, podpora v chatu, co dál s poptávkami |
| P2 | Stránka **„Pro vaši firmu"** | `/klient/pro-vasi-firmu` | zrcadlo (2.5), náhled připraveného ZakazIQ s jeho službami, cena vedle jeho ceny, obavy, jedna akce „Nastavíme to spolu" → konzultace |
| P3 | Karta **u poptávek z webu** | Přehled a detail zakázky, když přišla aspoň jedna poptávka | „Tento měsíc vám přes web napsalo 6 lidí. Odpovídáte jim z e-mailu. V ZakazIQ byste je měli v kalendáři." |
| P4 | Po hodnocení 9–10 | karta v Přehledu za 3 dny | ne na děkovné obrazovce, tam je recenze na Googlu |
| P5 | Položka menu **„Pro vaši firmu"** | levý sloupec, pod Konzultacemi | tichá, bez odznaku |
| P6 | **„Teď ne"** (odklad 60 dní) a **„Nezajímá mě"** (natrvalo) | u každé karty | stav v nové tabulce `portal.member_prompts`, Kryštof ho vidí v adminu |
| P7 | Po aktivaci **„Otevřít ZakazIQ"** místo nabídky | menu a Přehled | s jedním přihlášením (KV08) bez dalšího hesla |

`portal.member_prompts` drží údaje člena, takže patří do `portal_export_member`,
`portal_erase_member` a retence (R-131).

Náhled připraveného ZakazIQ v P2 se kreslí z projekce do `portal` (jen názvy služeb a otevírací
doba, úzkou funkcí jako u KP13), nikdy přímým čtením `ws` — `portal_app` do `ws` práva nemá
a mít nebude (4.1 v `PLAN.md`).

### 5.2 Workspace

| # | Prvek | Poznámka |
|---|---|---|
| W1 | Pruh **zkušební doby**: „Zbývá 9 dní. Zatím jste přijali 4 poptávky." | čísla z databáze účtu; po skončení zmizí |
| W2 | **E-maily majiteli** během zkušební doby | den 0 osobně od Kryštofa („kdyby cokoli, odpovězte"); po 3 dnech bez nastavené služby nebo doby nápověda; 4 dny před koncem rekapitulace a jak zrušit; sladit s připomínkou Stripe |
| W3 | Checklist **„Začněte"** s předem hotovými kroky | u účtu připraveného Kryštofem začíná „2 ze 3" a přibude krok „Web je napojený" |
| W4 | **Zdroj účtu** (`klient`, `landing`, `pozvanka`) | jediný sloupec na `ws.accounts`, pro trychtýř |
| W5 | **Oslava první poptávky** ve Workspace | jedna věta na Dnes, žádné konfety |

W1–W3 pomůžou i lidem, kteří přijdou z landing page. Vyplatí se postavit dřív než háčky v prostoru.

### 5.3 Admin

| # | Prvek | Poznámka |
|---|---|---|
| A1 | **Kandidáti na ZakazIQ** | seznam s důvodem „proč teď" (hotový web, poptávky za 30 dní, hodnocení, odklad) |
| A2 | **Připravit ZakazIQ pro klienta** z detailu zakázky | rozšíření „Pozvat klienta" (S17): název, obor, e-mail a služby předvyplněné ze zakázky; klíč webu rovnou |
| A3 | **Trychtýř** | čísla z oddílu 3.2 po měsících |
| A4 | Příznak **vhodný obor** u klienta | ruční, jedním klikem; bez něj se proaktivní nabídka neukáže |

### 5.4 Web klienta

Rozhodnuto (D-KV7, R-134): weby se na Workspace napojují **až na přání klienta**, ne předem.

- **Bez Workspace** (výchozí): poptávka jde klientovi e-mailem a ZakazIQ dostane jen počet
  (KP17, D-K20 = a).
- **S Workspace** (když klient Workspace chce): poptávka jde do Workspace přes API v1
  (`/api/public/v1/requests`) a e-mail pošle Workspace (R-045). Kryštof napojí formulář podle
  skillu `zakaziq-napojeni` a nasadí web znovu; počítá se s tím při plánování konzultace (krok 4
  v oddílu 7).

Pozor: v režimu s Workspace se ZakazIQ stává zpracovatelem údajů zákazníků klienta. To kryje
zpracovatelská smlouva Workspace (R-079), kterou klient přijímá při registraci. Bez registrace
se web na Workspace nenapojuje.

## 6. Mantinely

Klienti webu jsou pro Kryštofa cennější než jedno předplatné: doporučují ho dál a platí údržbu.
Žádný trik nesmí vztah poškodit.

| Takhle ne | Takhle ano |
|---|---|
| „Přicházíte o zákazníky! Nabídka končí za 2 hodiny." | „Tento měsíc vám přes web napsalo 6 lidí." |
| tlačítko „Ne, nechci víc zákazníků" | „Teď ne" a „Nezajímá mě" |
| „Používá nás 500 firem" | nic, dokud to není pravda; potom konkrétní firma s jejím souhlasem |
| předem zaškrtnutý souhlas s nabídkami | nezaškrtnutý, s vysvětlením |
| zrušení přes e-mail nebo telefon | zrušení jedním klikem (už je, R-074) |
| nabídka hned po hodnocení 0–6 | nejdřív se ozvat a problém vyřešit |
| stejná nabídka každý týden | nejvýš jedna proaktivní nabídka měsíčně, po „Nezajímá mě" nikdy |

**E-maily s nabídkou** podléhají zákonu č. 480/2004 Sb., § 7: obchodní sdělení e-mailem jen se
souhlasem, výjimka platí pro vlastní obdobné produkty stávajícímu zákazníkovi s možností odmítnout.
Jestli je Workspace „obdobný" webu, je výklad, který nikdo neověřil. Rozhodnuto (D-KV5): nabídka
jen v prostoru a osobně, e-mailem jen servisní výsledky webu bez nabídky. Nabídky e-mailem by
potřebovaly nové rozhodnutí a výslovný souhlas. Tohle není právní rada.

## 7. Fáze 1 bez kódu: ručně a osobně

Hned, jak půjde zaplatit (KV01). Kódu skoro žádný, rozhoduje rozhovor.

1. **Vybrat 3 kandidáty:** hotový web, chodí poptávky, spokojenost, služba s termíny nebo zakázkami.
   Prvnímu z nich platí R-066 (pilot zdarma).
2. **Připravit Workspace** přes „Pozvat klienta" (S17): firma, obor, služby, otevírací doba.
3. **Domluvit 20 minut** přes konzultaci v prostoru nebo telefonem.
4. **Ukázat živě** na jeho datech. Když Workspace chce, Kryštof napojí formulář webu na Workspace
   a web nasadí znovu (D-KV7).
5. **Po 7 dnech se ozvat:** „Přišla už poptávka? Jak se vám potvrzovala?"
6. **4 dny před koncem** zkušební doby rekapitulace osobně.
7. **Zapsat námitky** doslova. Podle nich se upraví texty v P2 a W2.

**Scénář rozhovoru** (návrh, Kryštofovými slovy ho upraví):

> „Web běží [X týdnů] a za tu dobu vám přes něj napsalo [N] lidí — vidíte to i ve svém prostoru.
> Teď vám chodí do e-mailu a odpovídáte z telefonu, že? Připravil jsem vám něco, co jste vlastně
> už zažil: když jste si u mě rezervoval konzultaci a přišlo vám potvrzení, to je ZakazIQ. Totéž
> můžou mít vaši zákazníci u vás. Máte tam už svoje služby a otevírací dobu, takže stačí
> projít dvě věci spolu. Zkuste to měsíc. Když vám to nebude sedět, zrušíte to jedním klikem
> a poptávky vám budou chodit jako teď."

Čísla v hranatých závorkách vždy z prostoru, nikdy odhadem.

## 8. Fáze a sezení

Jedno sezení = jedna konverzace v Claude Code. S ≈ půl dne, M ≈ den, L ≈ víc dní. Migrace od 128.

| Sezení | Co | Velikost | Závisí na | Oblast |
|---|---|---|---|---|
| **KV00** | ~~Rozhodnutí D-KV1–D-KV9 a zápis do paměti~~ hotovo 2026-11-21 (R-134, R-135) | S | — | `memory/` |
| **KV01a** | Landing do spuštění: hlavní akce „Vyzkoušet" → formulář „Chci to vyzkoušet" (do Hovorů, R-065); ověřit klíč Stripe ve Vercel Production | S | — | landing — **na produkci od 2026-11-21** (`1e3c993`, přepínač `SIGNUP_OPEN`); klíč Stripe neověřen |
| **KV01** | Odblokovat placení: Workspace na Supabase (R-107, F2), Stripe live, po spuštění vrátit akci landing page na registraci | L | KV01a, `docs/AUTH-SUPABASE-PLAN.md`, `docs/workspace/LAUNCH-PLAN.md` | přihlášení, externí služby |
| **KV01b** | Přesun z Vercelu na Cloudflare (R-135) — až s prvním platícím klientem; PDF přes Chromium, crony, `after()`, DPA | L | první platba | provoz |
| **KV02** | Fáze 1: zdroj účtu (W4), delší zkušební doba pro pozvané klienty, „Pozvat klienta" předvyplněné ze zakázky (A2), dotaz na kandidáty jako skript | M | KV01, D-KV3 | Workspace, admin (výjimka) |
| **KV03** | Prostor: `portal.member_prompts`, P1–P6, napojení na export, výmaz a retenci | M | KV00 | `app/klient`, `components/portal`, `lib/portal`, migrace |
| **KV04** | Vracecí smyčky: první poptávka z webu, měsíční výsledky (denní cron odešle 1. dne), rok webu; odhlášení | M | KV03 | prostor, cron |
| **KV05** | Workspace zkušební doba: W1, W2, W3, W5 | M | KV01 | Workspace, e-maily |
| **KV06** | Admin: kandidáti (A1), trychtýř (A3), příznak oboru (A4) | M | KV03 | admin (výjimka) |
| ~~**KV07**~~ | ~~Web připravený na ZakazIQ jako výchozí~~ — **nedělá se** (D-KV7: napojení až na přání) | — | — | — |
| **KV08** | Jedno přihlášení z prostoru do Workspace a P7 — vyplyne z F2 v KV01, zbývá propojit účet klienta a Workspace | M | KV01 | přihlášení, bezpečnost |
| **KV09** | Reference a doporučení od platících klientů | M | 3–5 platících | Workspace, landing |

Pořadí: KV01a → KV01 → KV02 + Fáze 1 (ručně) → KV05 → KV03 → KV04 → KV06 → KV08 → KV09;
KV01b, až zaplatí první klient. KV05 jde před háčky v prostoru, protože pomáhá všem registracím,
nejen klientům webu.

## 9. Rozhodnutí

Všechna rozhodl Kryštof 2026-11-21 (`memory/memory.md` R-134, D-KV8 jako R-135).

| # | Otázka | Rozhodnuto |
|---|---|---|
| D-KV1 | Jak první klienti přejdou do Workspace | osobně přes „Pozvat klienta" a konzultaci, prvních 5; samoobsluha z prostoru až s daty |
| D-KV2 | Pořadí přihlášení a landing page | nejdřív Supabase (F2, R-107), produkční Clerk se nedělá; do spuštění hlavní akce landing page → formulář „Chci to vyzkoušet" |
| D-KV3 | Nabídka pro klienty webu | 30 dní zkušební doby a nastavení spolu, cena 249 Kč beze slevy |
| D-KV4 | Karta při zkušební době | zůstává (R-038), s poctivou připomínkou před první platbou |
| D-KV5 | Nabídky e-mailem | jen v prostoru a osobně; e-mailem jen výsledky webu bez nabídky |
| D-KV6 | Komu nabízet | jen označenému vhodnému oboru a bez hodnocení 0–6 |
| D-KV7 | Nové weby připravené na ZakazIQ | **ne** — napojení na Workspace až na přání klienta (odchylka od doporučení) |
| D-KV8 | Provoz při prvním platícím klientovi (R-133) | **přesun na Cloudflare**, dopředu se nepřipravuje (odchylka od doporučení Vercel Pro; R-135) |
| D-KV9 | Jak představit značku | ZakazIQ jako Kryštofův produkt, VIZEON jako jeho studio; v prostoru věta „Tenhle prostor běží na ZakazIQ" |

## 10. Rizika

- **Vztah s klientem.** Vtíravá nabídka může stát doporučení a údržbu. Proti: strop frekvence,
  „Nezajímá mě", nic po hodnocení 0–6, osobní tón.
- **Podpora.** Každý platící klient čeká pomoc. Kryštof je na to sám; před KV09 zvážit, kolik
  klientů unese.
- **Nevhodný obor.** E-shop nebo automatizace z Workspace nic mít nemusí. Proti: příznak vhodného oboru.
- **Zpracování údajů.** Režim webu s Workspace mění roli ZakazIQ na zpracovatele (oddíl 5.4).
- **Přesun na Cloudflare až s prvním platícím klientem** (R-135). Mezi první platbou a dokončením
  přesunu běží placený provoz na Vercel Hobby. Přesun není na jeden den: PDF faktur a předávacích
  dokumentů vyrábí `puppeteer-core` s `@sparticuz/chromium`, které na Cloudflare Workers neběží;
  šest cronů z `vercel.json` musí jinam; `after()`, `proxy.ts` a běh Next.js 16 na Cloudflare
  (adaptér OpenNext) nikdo neověřil; DPA a regiony Cloudflare doplnit do `docs/klientsky-prostor/GDPR.md`.
  Čím později se začne, tím déle to okno trvá.
- **Supabase Free** u Workspace (uspání po týdnu bez provozu, sdílený projekt s adminem) — otevřené
  z R-107, teď předpoklad spuštění (D-KV2).
- **Napojení webu až na přání** (D-KV7) znamená při každé konverzi úpravu a nové nasazení webu
  klienta. Počítat s tím v čase Kryštofa u každého klienta.
- **Dvě značky.** E-maily chodí z krystof@vizeon.cz, prostor je ZakazIQ. Bez jasné věty (D-KV9)
  se klient může ptát, co je co.
- **Málo dat.** Pár klientů nedá statisticky nic. Rozhodovat podle rozhovorů, čísla brát jako vodítko.

## 11. Návrhy textů

Návrhy k doladění skillem `zakaziq-ux-texty-cs`, marketingové části `humanize-text-cs`. Čísla
v hranatých závorkách jsou vždy skutečná data klienta.

- **P1** — nadpis „Váš web je venku." Text: „Teď jde o to, aby z něj chodili zákazníci. Kolik lidí
  vám přes web napsalo, uvidíte tady každý měsíc."
- **E-mail o první poptávce** — předmět „Váš web přinesl první poptávku". Text: „Právě vám přes web
  napsal první člověk. Poptávku máte v e-mailu jako obvykle. Kolik jich přibude, uvidíte ve svém
  prostoru." Bez nabídky.
- **P3** — „Tento měsíc vám přes web napsalo [N] lidí. Teď jim odpovídáte z e-mailu. V ZakazIQ byste
  je měli rovnou v kalendáři a potvrdili jedním klikem." Akce: „Ukázat, jak by to vypadalo".
- **P2 nadpis** — „Co jste měli u mě, můžou mít vaši zákazníci u vás." Akce: „Nastavíme to spolu".
  Vedle: „Teď ne".
- **W2, 4 dny před koncem** — „Za 4 dny skončí zkušební doba. Za tu dobu jste v ZakazIQ přijali [N]
  poptávek a potvrdili [M] termínů. Když chcete pokračovat, nemusíte nic dělat. Když ne, předplatné
  zrušíte tady jedním klikem a poptávky z webu vám budou chodit e-mailem jako dřív."

## 12. Zdroje

- V repu: `docs/klientsky-prostor/PLAN.md` (KP11–KP17, D-K16, D-K20), `docs/workspace/PLAN.md`,
  `docs/workspace/LAUNCH-PLAN.md`, `PRODUCT.md`, `lib/ws/billing.ts`, `lib/ws/admin/invite.ts`,
  `lib/ws/email/catalog.ts`, `components/portal/overview.tsx`, `components/ws/app/today/welcome.tsx`,
  rozhodnutí R-038, R-045, R-066, R-074, R-079, R-107, R-119, R-129, R-130, R-133.
- Principy: R. Cialdini, *Influence* (reciprocita, sympatie, autorita, konzistence, sociální důkaz,
  nedostatek); B. J. Fogg, model chování B = MAP; N. Eyal, *Hooked* (smyčka podnět–akce–odměna–investice);
  D. Kahneman a A. Tversky (averze ke ztrátě, kotva); D. Kahneman, pravidlo vrcholu a konce;
  J. Nunes a X. Drèze (rozběhnutý pokrok, 2006); H. Dai, K. Milkman, J. Riis (efekt nového začátku, 2014).
- Zákon č. 480/2004 Sb., o některých službách informační společnosti, § 7.
