> Export plánu z dokumentu „ZakazIQ Workspace — produktový a designový plán“ (8. 10. 2026, revize 44, po rozhodnutích R-016–R-025 v S00). Zdroj pravdy pro rozsah. Při změně plánu exportovat znovu.

# ZakazIQ Workspace — produktový a designový plán

Oct 8, 2026 · @Kryštof Sobotka

## Vize: jedna aplikace, dvě části

ZakazIQ zůstává jednou Next.js aplikací v tomto repu. Stávající část se nemění a stává se **admin konzolí**, vedle ní vzniká **ZakazIQ Workspace** pro klienty a veřejná **landing page**, která Workspace představuje.

| Část | Pro koho | Přihlášení | Stav |
| --- | --- | --- | --- |
| Landing page (`/`) | návštěvníci, budoucí klienti | žádné | nová |
| ZakazIQ Workspace (`/w/...`) | firmy: kadeřnictví, zámečnictví, studnařství, likvidace azbestu… | Clerk | nová |
| Admin konzole (`/dashboard`, `/alteno`, `/hub`, `/login`) | jen Kryštof | NextAuth jako dnes, odkaz „Admin“ ve footeru landing page | beze změny |
| Klientský portál (`/p/[token]`) | zákazníci firem | bez přihlášení | převzít do Workspace |

&#91;embedded content: architektura · landing, Workspace, admin, jedna databáze\]

Workspace a admin sdílejí aplikaci i databázi, ale každý má vlastní přihlášení a vlastní schéma.

Workspace je přehled podnikání pro malé firmy, které dostávají poptávky. Klient si zapne jen moduly, které potřebuje, sám si nastaví kolonky, stavy a věrnostní kartu a poptávky z jeho webu nebo e-shopu mu přicházejí rovnou do účtu. Obchodní model: postavím klientovi web, napojím ho na Workspace a klient platí měsíční předplatné přes Stripe.

Čím se odlišíme od běžných rezervačních systémů:

- **Vše na jedné obrazovce:** příchozí poptávky, kalendář a karta zákazníka vedle sebe, bez proklikávání.
- **Poptávka rovnou v kalendáři** jako čárkovaný blok, potvrzení jedním klikem.
- **Systém přivádí zákazníky zpět:** panel „Komu napsat“ podle segmentů a věrnostních karet.
- **Šablony podle oboru:** nový byznys dostane předvyplněné kolonky, stavy a dokumenty.
- **Peníze a daně v jednom pohledu**, včetně odhadu, kolik si odložit (odhad, ne daňové poradenství).

## Výchozí stav repa

Repo `sobotkakrystof5-png/projectiq` je Next.js 14 (App Router) + TypeScript + Tailwind + Neon, zhruba 300 souborů a 63 SQL migrací. Je postavené pro jednoho uživatele: jediný admin účet z env proměnných, dva byznysy napevno v kódu (`'vizeon' | 'alteno'`) a kořenová stránka `/` dnes jen přesměruje na `/hub` nebo `/login`.

**Zůstává beze změny (admin konzole):** `/dashboard/*`, `/alteno/*`, `/hub/*`, `/login`, všechny stávající tabulky, NextAuth, e-maily přes Gmail, cron joby a stávající vzhled (brand-\* modrá, Inter).

**Co převzít jako vzor do Workspace** (zkopírovat a zobecnit, ne měnit původní soubory):

| Vzor v repu | Soubor | Použití ve Workspace |
| --- | --- | --- |
| Veřejný příjem poptávek: API klíč, rate limit, CORS, Zod | `lib/web-booking.ts`, `lib/api-auth.ts`, `lib/api-rate-limit.ts` | příjem z webů a e-shopů, klíče per byznys v DB místo env |
| Ochrana proti kolizi termínů v DB | migrace 008, 043, 044 | výlučné omezení na časové rozsahy per byznys a pracovníka |
| Časové helpery Europe/Prague | `lib/prague-time.ts` | sloty, otevírací doba, kalendář |
| Klientský portál bez registrace | `app/p/[token]`, `app/portal-actions.ts` | portál pro zákazníky firem |
| NPS hodnocení | `components/NpsRating.tsx`, `FeedbackBlock.tsx` | modul Hodnocení |
| Faktury a AI přepis PDF | `lib/invoices.ts`, `lib/invoice-ai.ts` | modul Faktury |
| Daňové výpočty a termíny | `lib/tax.ts`, `lib/tax-deadlines.ts`, `lib/tax-constants.ts` | modul Daně (odhad) |
| Notifikace | `lib/notifications.ts` | notifikace per uživatel |
| Brandované e-maily | `lib/email.ts` | přes Resend (balíček už je v závislostech), ne přes Gmail |

**Co se nepřebírá:** Hub (škola, sport, osobní finance), Hovory, osobní plány, startup projekty a hardcoded logika VIZEON/ALTENO. To je osobní admin část.

## Design systém „Dílky“ (závazný)

Závazným vzhledem celého projektu je návrh **LP-D · Podle loga ZakazIQ** na plátně [ZakazIQ Workspace – mockupy](https://claude.ai/artifact/R5WSezYUPY6Tt9weQgBNez), schválený 8. 10. 2026. Platí pro landing page, aplikaci Workspace, klientský portál, stránku pro objednání i e-maily. Starší mockupy (A–D, C2–C5, LP-A až LP-A3) zůstávají platné pro rozložení a funkce, ne pro barvy a grafiku. Admin konzole si nechává svůj dnešní vzhled.

**Princip:** vše vychází z loga, tmavě modrého čtverce s mřížkou 2×2 bílých dílků. Hlavní barva je námořnická modrá, opakující se motiv jsou dílky a jediná teplá barva patří nové poptávce a odměně. Z Alteno jen jemné prvky: zaoblená tlačítka, čísla kroků 01–06, běžící pás. Žádné velké černé bloky, žádný linkovaný papír.

**Barvy** (CSS proměnné, shadcn/ui na ně napojené; řada `navy` odpovídá dnešní řadě `brand` v `tailwind.config.ts`):

| Token | Hodnota | Použití |
| --- | --- | --- |
| `navy-950` | #0c1a36 | tmavé plochy (hero, postranní panel, footer), hlavní text |
| `navy-800` / `navy-700` | #1b3868 / #23478b | hlavní tlačítka, aktivní stav, logo, potvrzené termíny |
| `navy-500` | #3a6ec4 | akcentová kurzíva v nadpisech na světlém, čísla sekcí |
| `navy-300` / `navy-200` | #8aaee3 / #b8ceef | kurzíva a text na tmavém |
| `navy-100` / `navy-50` | #dce7f7 / #eef2fb | okraje, potvrzené bloky, plochy ilustrací |
| `ground` / `card` | #f4f6fb / #ffffff | pozadí stránky / karty |
| `muted` | #4a5878 | vedlejší text |
| `signal` | #ffb547, plocha #fff7e8, čárkovaný okraj #e19a2c, text #6b4300 | **jen** nová poptávka, živé upozornění, připravená odměna |
| `danger` | #b3261e | odmítnutí, mazání, po splatnosti |

**Písmo:** Instrument Sans (rozhraní a nadpisy, váha 600, těsné prokladání), Instrument Serif kurzívou pro druhou půlku nadpisu („Každá poptávka *na svém místě.*“), JetBrains Mono pro částky, časy, čísla a štítky. V aplikaci se kurzíva používá střídmě, jen v nadpisech stránek.

**Tvary:** tlačítka a filtry jako pilulky; drobné prvky zaoblení 9–12 px, karty 20–24 px, velké panely 28–32 px, hero a footer landing page 40 px dole / nahoře. Okraje 1 px `navy-100`, stíny jen u plovoucích prvků (věrnostní karta, dialogy).

**Motiv dílků:** logo s mřížkou 2×2, kde dva dílky jemně dýchají; pole dílků v pozadí tmavých ploch s několika pulzujícími; moduly a dlaždice v různých odstínech modré; malý znak 2×2 jako odrážka u oborů a štítků.

**Pohyb (jen tam, kde něco vysvětluje):**

- Příchod nové poptávky: vyjetí shora a zprůhlednění, 600 ms, křivka `cubic-bezier(.2,.8,.2,1)`; blok v kalendáři se objeví stejně.
- Živá tečka `signal` s rozbíhajícím se kruhem u „právě dorazilo“.
- Razítko na věrnostní kartě „vyskočí“, při plné kartě změní text na odměnu.
- Ukazatel postupu u kroků, růst sloupců grafů při načtení, plynulé nájezdy sekcí na landing page.
- Pulz dílků v pozadí 4–7 s, běžící pás oborů, blikající kurzor u kódu.
- Landing page smí být bohatší, v aplikaci se animuje jen změna stavu (nová poptávka, potvrzení, razítko, uloženo). Animace nikdy nezdržuje práci a při `prefers-reduced-motion` se vypíná.

**Použití v aplikaci Workspace:** postranní panel `navy-950` s logem a aktivní položkou ve `navy-700`; obsah na `ground`, karty bílé; nová poptávka všude jako čárkovaný blok `signal` (nahrazuje tyrkysovou z mockupů C); potvrzené termíny `navy-100` s levým okrajem `navy-700`; věrnostní karta jako modrá karta s bílými razítky; hlavní tlačítko `navy-700`. Tmavý režim na `navy-950` se stejnými tokeny.

**Klientský portál a stránka pro objednání:** stejný systém. Byznys si může nastavit logo a jednu vlastní akcentovou barvu, struktura, písmo a pohyb zůstávají.

**Co se přebírá z předchozích návrhů:** rozložení „vše na jedné obrazovce“ (C), čárkovaný blok poptávky v kalendáři, panel „Komu napsat“ (C2), obrazovka Peníze (C3), vlastní kolonky s živým náhledem (C4), průvodce novým byznysem (C5), mobilní Dnes (D), číslování sekcí a monospace čísla, „záznam“ kroků poptávky (LP-B), ceník s položkami „v ceně“.

## Struktura aplikace a obrazovky

Workspace má dvě úrovně: **účet** (firma, jedno IČO, předplatné, tým) a v něm libovolný počet **byznysů** (např. Kadeřnictví a Kosmetika, nebo Zámečnictví a Likvidace azbestu). Byznys má vlastní moduly, služby, kolonky, stavy, věrnostní program a napojený web. Postranní panel ukazuje jen zapnuté moduly, přepínač v hlavičce mění byznys a Peníze mají navíc pohled „Vše · jedno IČO“. V ceně 249 Kč je zatím jeden byznys: struktura pro víc byznysů zůstává, přidání dalšího je vypnuté, dokud nebude rozhodnutá jeho cena.

| Obrazovka | Cesta | Co ukazuje | Mockup |
| --- | --- | --- | --- |
| Dnes | `/w/[byznys]` | příchozí poptávky, týdenní kalendář, karta vybraného zákazníka; vše na jedné obrazovce | C, D (mobil) |
| Poptávky | `/w/[byznys]/poptavky` | seznam a detail poptávky, potvrdit / jiný čas / odmítnout | C, A (rozložení detailu) |
| Kalendář | `/w/[byznys]/kalendar` | den / týden / měsíc, poptávky jako čárkované bloky, blokace, pracovníci | C |
| Zákazníci | `/w/[byznys]/zakaznici` | tabulka se segmenty a razítky, panel „Komu napsat“ | C2 |
| Detail zákazníka | `/w/[byznys]/zakaznici/[id]` | věrnostní karta, historie, útrata, poznámky, segment | C (pravý panel) |
| Zakázky | `/w/[byznys]/zakazky` | tok zakázek podle vlastních stavů (tabule i seznam) | B (tabule) ve stylu C |
| Faktury | `/w/[byznys]/faktury` | vystavené a přijaté faktury, PDF, splatnost | C3 |
| Příjmy | `/w/[byznys]/prijmy` | příjmy a výdaje, graf, příjmy podle segmentů | C3 |
| Daně | `/w/[byznys]/dane` | odhad, kolik si odložit, obrat vůči limitu DPH, termíny | C3 |
| Nastavení byznysu | `/w/[byznys]/nastaveni/...` | moduly, služby, kolonky, stavy, otevírací doba, věrnost, segmenty, web | C4 (+ nové obrazovky) |
| Nový byznys | `/w/novy` | 4 kroky: obor, služby, napojení webu, tým | C5 |
| Účet | `/w/ucet` | předplatné (Stripe), tým a role, fakturace účtu, export dat | dopracovat |

Pravidla rozložení: žádná akce dal než dva kliky od obrazovky Dnes, detail se otevírá v pravém panelu místo nové stránky a ⌘K umí vyhledat cokoli i založit rezervaci příkazem („rezervace Tereza pátek 9:00“). Na telefonu se panely skládají pod sebe a navigační lišta je dole (mockup D).

## Nastavení: co si klient zapíná a nastavuje

Každý byznys si v **Nastavení › Moduly** zapíná funkce. Vypnutý modul zmizí z menu, ale data zůstávají. Všechny moduly jsou v ceně předplatného 249 Kč měsíčně.

| Modul | Co dělá | Závisí na | Výchozí stav |
| --- | --- | --- | --- |
| Poptávky | příjem z webu, e-shopu, ručně i telefonem | — | vždy zapnuto |
| Zákazníci | karta zákazníka, historie, segmenty | — | vždy zapnuto |
| Kalendář a rezervace | sloty podle služeb a otevírací doby, blokace, pracovníci | Poptávky | podle oboru |
| Zakázky | tok podle vlastních stavů, zálohy, dokumenty | Poptávky | podle oboru |
| Věrnostní karty | razítka a odměny | Zákazníci | vypnuto |
| Faktury | vystavení, PDF, AI přepis přijatých faktur, splatnost | — | vypnuto |
| Příjmy a výdaje | evidence, graf, příjmy podle segmentů | — (Faktury do něj zapisují) | vypnuto |
| Daně | odhad daně a odvodů, limit DPH, termíny | Příjmy a výdaje | vypnuto |
| Klientský portál | zákazník vidí stav své zakázky bez registrace | Zakázky | vypnuto |
| Hodnocení | NPS po dokončení, přehled spokojenosti | Zákazníci | vypnuto |
| Připomínky | e-mail / SMS před termínem, „Komu napsat“ | Zákazníci | vypnuto |

**Věrnostní karty** (Nastavení › Věrnost):

- Počet razítek do odměny (např. 5) a text odměny („střih zdarma“, „−10 %“).
- Co se počítá jako razítko: zaplacená návštěva, dokončená zakázka, nebo částka (1 razítko za každých X Kč), volitelně jen vybrané služby.
- Minimální útrata pro razítko a nejvýš 1 razítko za den.
- Platnost razítek v měsících (nebo bez omezení).
- Automaticky po zaplacení, nebo ruční potvrzení; ruční přidání nebo odebrání razítka s důvodem (záznam v historii).
- Uplatnění odměny: automaticky se nabídne při další rezervaci, po uplatnění začíná nová karta.
- Oznámení zákazníkovi: stav karty v potvrzovacím e-mailu a upozornění, že příště čeká odměna.
- Později: více úrovní (stříbrný / zlatý zákazník), karta v Apple / Google Wallet.

**Další sekce nastavení byznysu:**

- **Služby a ceník:** název, délka, cena, kdo ji dělá, zobrazit na webu.
- **Formulář poptávky (kolonky):** typy Text, Volba, Výběr, Číslo, Datum, Termín, Kontakt, Adresa, Soubor; povinné / nepovinné, pořadí přetažením, živý náhled (C4).
- **Stavy zakázky:** vlastní názvy a pořadí, každý stav má typ (nová / rozpracovaná / hotová / zaplacená / zrušená), podle typu fungují statistiky a věrnost.
- **Otevírací doba a pracovníci:** směny, dovolené, rozestupy mezi termíny.
- **Segmenty zákazníků:** hranice pro Nové, Stálé, Spící (viz další sekce).
- **Napojený web:** povolené domény, veřejný klíč pro widget, tajný klíč pro e-shop a webhooky, kód pro vložení, záznam posledních příchozích poptávek.
- **Vzhled:** barva a logo byznysu pro formulář, portál a e-maily.

## Segmenty zákazníků a příjmy

Každý zákazník patří právě do jednoho segmentu, který se počítá automaticky z jeho návštěv a zakázek. Hranice si byznys upravuje v nastavení a výchozí hodnoty přicházejí se šablonou oboru: kadeřnice měří v týdnech, studnař v letech. Místo „zrušení klienti“ navrhuji **Ukončení** a místo „staří klienti“ **Spící**, protože se ještě dají vrátit.

| Segment | Pravidlo | Výchozí hodnota (kadeřnictví) | Co nabídne panel „Komu napsat“ |
| --- | --- | --- | --- |
| Noví | první návštěva v posledních N dnech | 30 dní | poděkování, pozvání na druhou návštěvu |
| Stálí | aspoň X návštěv za 12 měsíců a poslední návštěva v normě | 3 návštěvy | věrnostní odměna, narozeniny |
| Jednorázoví | právě 1 návštěva, starší než okno pro Nové | po 30 dnech | jedna nabídka návratu, pak už nic |
| Spící | dříve Stálí, ale nepřišli déle než 2× jejich obvyklý interval | interval se počítá z historie, minimum 8 týdnů | SMS s volnými termíny |
| Ukončení | sami zrušili, odhlásili se z kontaktu, nebo je firma označila ručně | ručně / odhlášení | nic, zákazník se neoslovuje |

Pořadí vyhodnocení: Ukončení → Noví → Spící → Stálí → Jednorázoví. Segment se přepočítá po každé návštěvě a jednou denně cronem (Spící vznikají plynutím času). Změna segmentu se zapisuje do historie, aby šlo ukázat „letos se vrátilo 9 spících zákaznic“.

**Příjmy** pak ukazují:

- příjmy a výdaje po měsících, za byznys i za celé IČO;
- příjmy podle segmentů (kolik přinášejí Stálí oproti Novým);
- průměrnou útratu na návštěvu a hodnotu zákazníka za 12 měsíců;
- příjmy podle služeb a podle zdroje poptávky (web, e-shop, telefon), aby bylo vidět, kolik vydělá web, který jsem klientovi postavil;
- způsob platby (hotovost / karta / převod) a nezaplacené částky.

## Landing page

Landing page běží na `/` ve stejné aplikaci a nahrazuje dnešní přesměrování. Představuje Workspace, vede k registraci a ve footeru má nenápadný odkaz **Admin** na stávající `/login`. Vzhled a struktura podle návrhu LP-D (design systém Dílky): tmavě modrý úvod s polem dílků a živou ukázkou aplikace, číslované sekce, animace přicházející poptávky a věrnostní karty, tón přímý a v první osobě zakladatele.

| # | Sekce | Obsah |
| --- | --- | --- |
| 01 | Hero | nadpis typu „Poptávky, zákazníci a peníze na jednom místě\_“, jedna věta, CTA „Začít za 249 Kč měsíčně“ + „Domluvit hovor“, vedle živá ukázka obrazovky Dnes |
| 02 | Proč to řešit | papírový diář, Excel a zprávy rozházené po telefonu oproti jednomu přehledu; srovnání dnes / se ZakazIQ |
| 03 | Jak to funguje | animovaný tok: poptávka z webu → blok v kalendáři → potvrzení → faktura → razítko na věrnostní kartě; tlačítko „Přehrát znovu“ |
| 04 | Moduly | mřížka modulů ze sekce Nastavení s jednou větou ke každému; „zapněte si jen to, co potřebujete“ |
| 05 | Pro koho | obory se šablonami: kadeřnictví a kosmetika, zámečnictví, studnařství, likvidace azbestu, autoservis, úklid, stavba |
| 06 | Zákazníci se vracejí | věrnostní karta a segmenty, panel „Komu napsat“ |
| 07 | Peníze a daně | ukázka obrazovky Peníze, jasné „odhad, ne daňové poradenství“ |
| 08 | Napojení na váš web | widget, e-shop, „web vám postavím a napojím“, odkaz na reference |
| 09 | Ceník | jedna cena 249 Kč měsíčně, všechny moduly v ceně, zrušení kdykoli; tlačítko rovnou na registraci |
| 10 | Časté dotazy | data a GDPR, export, zrušení, kolik to stojí, jak dlouho trvá napojení |
| 11 | Kontakt | formulář, který založí poptávku v admin konzoli (stávající vzor `/api/public/leads`) |
| — | Footer | navigace, právní stránky (podmínky, GDPR, zpracovatelská smlouva), IČO, odkaz Admin |

**Registrace přímo z landing page, bez složitostí:**

1. Tlačítko „Začít za 249 Kč měsíčně“ (v hero, v ceníku a ve footeru).
2. Registrace přes Clerk: e-mail s jednorázovým kódem nebo „Pokračovat přes Google“. Žádné heslo, žádné potvrzování e-mailu odkazem.
3. Dvě otázky: název byznysu a obor (dlaždice). Vše ostatní doplní šablona.
4. 14 dní zdarma, bez platební karty. Stripe Checkout na 249 Kč měsíčně přijde na řadu až na konci zkušební doby.
5. Obrazovka Dnes s jediným úkolem: „Zkopírujte odkaz na objednání“ nebo „Vložte kód na web“.

Cíl: od kliknutí na landing page po první možnou poptávku do 3 minut. Landing page se generuje staticky a pro SEO dostane metadata, Open Graph obrázek a strukturovaná data.

## Jednoduchost a napojení webu

Aplikace musí zvládnout každý bez návodu a bez technických znalostí, a přitom si nechá vlastní styl systému Dílky. Jednoduchost je tvrdé pravidlo pro každou obrazovku, ne vylepšení na konec.

**Napojení webu klienta: tři cesty, od nejjednodušší.** Poptávka z každé z nich se sama založí jako nová zakázka v účtu klienta, bez kopírování.

1. **Weby postavené v Claude Code (hlavní cesta).** V Nastavení › Napojený web je tlačítko **„Zkopírovat prompt pro Claude Code“**. Prompt obsahuje adresu API, název env proměnné `ZAKAZIQ_KEY` (tajný klíč byznysu se vloží do Vercelu, nikdy do kódu), aktuální kolonky a služby byznysu a přesné zadání: formulář na webu odešle data serverově (Next.js server action nebo route handler) na `POST /api/public/v1/requests`. Prompt vložíš do Claude Code v projektu klienta, ten napojení postaví a pak klikneš na „Ověřit napojení“. Klíč není v prohlížeči, takže není potřeba CORS ani povolené domény.
2. **Odkaz, žádný kód.** Každý byznys má hotovou stránku pro objednání, např. `[DOMÉNA]/r/kadernictvi-lenka`, ve své barvě a s logem. Funguje hned po registraci: tlačítko na webu, Instagram, Google profil nebo QR kód na pult.
3. **Jeden řádek pro cizí weby (záloha).** Když má klient web, který jsi nestavěl ty (WordPress, Wix, Shoptet), tlačítko „Zkopírovat kód“ dá `<script src="[DOMÉNA]/embed/kadernictvi-lenka.js"></script>` s veřejným klíčem, povolenými doménami a rate limitem.

**Co k tomu potřebuje Claude Code:**

- Veřejně popsané API: `GET /api/public/v1/schema` (kolonky a služby byznysu jako JSON podle klíče) a `POST /api/public/v1/requests` s jasnými chybovými hláškami česky i strojově (`code`).
- Skill **`zakaziq-napojeni`** ve tvých skillech pro Claude Code: postaví formulář ve stylu webu klienta, serverovou akci, validaci a děkovnou zprávu, přidá `ZAKAZIQ_KEY` do `.env.example` a ověří napojení testovací poptávkou. Napojit pak jde jedinou větou: „napoj formulář na ZakazIQ“.
- Doplnění skillu `web-project-brief`: každý nový brief klientského webu bude mít sekci „Poptávky do ZakazIQ“, takže napojení vznikne rovnou při stavbě webu.

V aplikaci k tomu patří tlačítko **„Ověřit napojení“** (pošle zkušební poptávku a ukáže zelenou fajfku) a **„Poslat návod webáři“** (e-mail s kódem a přesným postupem pro jeho systém). Volba „Automaticky přijímat poptávky do volných termínů“ je ve výchozím stavu vypnutá; po zapnutí se poptávka rovnou potvrdí a zákazníkovi přijde e-mail.

**Pravidla jednoduchosti pro každou obrazovku:**

- Začátek do 3 minut: registrace, obor, název, a aplikace je hned použitelná díky šabloně oboru. Veškeré nastavení je volitelné.
- Na obrazovce jedna hlavní akce v zelené barvě, ostatní jsou tiché.
- Obyčejná čeština: „Potvrdit termín“, ne „Změnit stav na confirmed“; žádné zkratky ani technická slova.
- Prázdné obrazovky říkají, co udělat dál („Zatím žádná poptávka. Zkopírujte odkaz na objednání →“).
- Místo potvrzovacích dialogů tlačítko „Zpět“ po dobu několika sekund.
- Velké klikací plochy (min. 44 px), vše jde ovládat i na telefonu jednou rukou.
- Pokročilé věci (kolonky, stavy, segmenty) jsou schované v Nastavení a mají rozumné výchozí hodnoty.
- Test před každou fází: člověk, který aplikaci nikdy neviděl, zvládne bez pomoci zaregistrovat se, přijmout poptávku a vystavit fakturu.

## E-maily, upozornění a novinky

E-maily fungují hned po registraci bez nastavování. Odcházejí z domény ZakazIQ, jako odesílatel se ukazuje jméno byznysu („Kadeřnictví Lenka“) a odpovědi zákazníků jdou rovnou do schránky klienta, třeba do jeho Gmailu. Každý e-mail si klient v Nastavení › E-maily a upozornění zapne nebo vypne, upraví mu text a vidí živý náhled.

**Napojení schránky, od nejjednodušší:**

1. **Bez nastavení (výchozí).** Odesílá se přes Resend z `rezervace@[DOMÉNA]` se jménem byznysu, odpověď (Reply-To) jde na e-mail klienta.
2. **Vlastní doména (pokročilé).** Klient přidá 3 DNS záznamy podle návodu v aplikaci a e-maily chodí z `info@jeho-domena.cz`. Pro weby, které stavíš ty, to uděláš rovnou při spuštění webu.
3. **Připojit Gmail (později).** Přihlášení Googlem a odesílání z jeho Gmailu. Vyžaduje ověření aplikace u Googlu, proto až po spuštění. Ve stejné fázi přibude synchronizace rezervací do Google Kalendáře.

**E-maily zákazníkům firmy:**

| E-mail | Kdy odchází | Výchozí stav |
| --- | --- | --- |
| Přijali jsme vaši poptávku | hned po odeslání formuláře | zapnuto |
| Potvrzení rezervace | po potvrzení, s tlačítkem „Přidat do kalendáře“ (.ics) a odkazy Přesunout / Zrušit | zapnuto |
| Změna nebo odmítnutí termínu | po změně, s návrhem nového času | zapnuto |
| Připomínka termínu | 24 h předem (čas lze změnit) | zapnuto |
| Poděkování | po zaplacené návštěvě, se stavem věrnostní karty a prosbou o hodnocení | zapnuto |
| Odměna je připravena | když se karta naplní | zapnuto, je-li zapnutá věrnost |
| Faktura | po vystavení, PDF v příloze | zapnuto, je-li zapnutý modul Faktury |
| Zpráva skupině („Komu napsat“) | jen ručně, jen zákazníkům se souhlasem, s odkazem na odhlášení | ručně |

**Upozornění pro klienta (majitele firmy):**

| Upozornění | Kdy | Kanál |
| --- | --- | --- |
| Nová poptávka | okamžitě; v e-mailu tlačítka **Potvrdit** a **Navrhnout jiný čas**, která fungují bez přihlášení (jednorázový podepsaný odkaz) | e-mail + upozornění v aplikaci a na telefonu |
| Ranní přehled dne | každý pracovní den v 7:00: dnešní termíny, nevyřízené poptávky | e-mail |
| Týdenní přehled | v pondělí: týden dopředu, kdo nepřišel, komu napsat | e-mail |
| **Měsíční přehled** | 1. den v měsíci: příjmy a srovnání s minulým měsícem, kolik poptávek přišlo z webu, noví / stálí / spící zákazníci, nejlepší služba, kolik si odložit na daně | e-mail + stránka v aplikaci |
| Faktura po splatnosti, limit DPH, neúspěšná platba předplatného | při události | e-mail + upozornění v aplikaci |

**Novinky ZakazIQ (newsletter aplikace):** jednou měsíčně a při větší novince e-mail „Co jsme vylepšili“ všem účtům. Píšeš ho v admin konzoli na nové stránce `/dashboard/novinky` (nadpis, krátký text, obrázek, odkaz) a stejné novinky se ukážou v aplikaci v panelu „Co je nového“. Odhlásit se jde jedním kliknutím. Upozornění na platby a bezpečnost chodí vždy.

**Technicky:** Resend + šablony v React Email ve stylu systému Dílky (logo a akcent byznysu), fronta odchozích zpráv v tabulce `ws.outbound_messages` s opakováním při chybě, přehledy přes Vercel Cron, webhook Resend pro nedoručené e-maily, odhlašovací odkazy přes podepsané tokeny. Na doméně ZakazIQ nastavit SPF, DKIM a DMARC, jinak e-maily padají do spamu. E-mail nikdy nesmí shodit uložení poptávky, stejně jako dnes v adminu.

## Technologie, přihlášení, platby a admin

Navržený stack sedí na to, co repo už používá. Přibývají jen Clerk, Stripe a shadcn/ui komponenty.

| Vrstva | Volba | Poznámka |
| --- | --- | --- |
| Framework | Next.js 14 App Router + React 18 + TypeScript | jako dnes; upgrade na Next 15 až jako samostatný krok po spuštění |
| Styl | Tailwind CSS + shadcn/ui | `components/ui` je dnes prázdná, nainstalovat nově s tokeny systému Dílky pro Workspace, klientský portál a landing page |
| Databáze | Neon (stávající projekt) | nové schéma `ws`, vlastní DB role bez přístupu k admin tabulkám, migrace dál v `migrations/` od čísla 064 |
| Přihlášení klientů | Clerk | Organizations = účet (firma), role vlastník / pracovník, webhook synchronizuje účty do DB |
| Přihlášení admina | NextAuth jako dnes | odkaz „Admin“ ve footeru landing page vede na `/login` |
| Platby | Stripe Billing | předplatné účtu, Checkout, Customer Portal, webhooky |
| E-maily klientů | Resend | odesílání za byznys (jméno a odpovědní adresa klienta); admin dál Gmail |
| Formuláře a validace | Zod + react-hook-form | jako dnes |
| Animace, ikony | Framer Motion, Lucide | jako dnes |
| Plánování | Vercel Cron | segmenty, připomínky, splatnosti |

**Jak se přihlášení dělí (jeden `middleware.ts`):**

- Veřejné: `/`, landing stránky, `/p/[token]`, `/api/public/*`, `/api/stripe/webhook`, `/api/clerk/webhook`.
- Workspace (`/w/*`, `/api/ws/*`): Clerk, bez přihlášení přesměruje na registraci nebo přihlášení.
- Admin (`/dashboard/*`, `/alteno/*`, `/hub/*`): NextAuth token jako dnes, bez něj přesměrování na `/login`.
- Každá serverová akce ve Workspace začíná `requireWorkspace()`: ověří uživatele, účet a roli a že byznys patří tomu účtu. Bez ní se do DB nesmí.

**Stripe:**

- **Jeden tarif: 249 Kč měsíčně**, všechny moduly v ceně. Žádné porovnávání balíčků, jedno tlačítko. Je to konečná cena: provozovatel je neplátce DPH, takže se nic nepřipočítává. Ve Stripe jeden produkt a jedna měsíční cena (`STRIPE_PRICE_MONTHLY`).
- **Zkušební doba 14 dní bez karty.** Počítá se v databázi Workspace, ne jako Stripe trial. `hasActiveSubscription` bere v úvahu i běžící zkušební dobu. Po jejím konci přijde výzva k platbě a do zaplacení platí režim jen pro čtení.
- **V ceně 1 byznys a neomezeně pracovníků.** Struktura účtu s více byznysy zůstává připravená, přidání dalšího byznysu je zatím vypnuté.
- Platba kartou, Apple Pay a Google Pay přes Stripe Checkout; kartu, fakturaci a zrušení si klient řeší sám ve Stripe Customer Portal.
- Checkout se zakládá na serveru s ID účtu v metadatech. Webhook zpracuje dokončení platby, změny a zrušení předplatného a zaplacené i nezaplacené faktury; každá událost se ukládá a zpracuje jen jednou.
- Jedna funkce `hasActiveSubscription(účet)` rozhoduje o přístupu. Po neúspěšné platbě 7 dní lhůta s upozorněním, pak režim jen pro čtení; data se nikdy nemažou a poptávky z webu se dál ukládají.
- Stripe vystavuje klientovi daňové doklady automaticky.
- Později: online zálohy od zákazníků firem přes Stripe Connect (samostatná fáze kvůli ověření firem a poplatkům).

**Admin konzole** zůstává, jak je. Jediný doplněk je nová stránka `/dashboard/klienti`, která nic stávajícího nemění: seznam účtů Workspace, stav předplatného, počet poptávek, založení účtu pro klienta a vygenerování klíče pro jeho web. Admin ji čte přes vlastní roli databáze.

**Nové env proměnné:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_*` (po tarifu), `DATABASE_URL_WS` (role pro schéma `ws`), `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`. Přidat do `.env.example`.

## Datový model pro více klientů

Všechny tabulky Workspace jsou ve schématu `ws` a nesou `account_id`. Tabulky vázané na byznys nesou i `business_id`. Data různých klientů odděluje aplikační vrstva (`requireWorkspace()` + dotazy vždy filtrované účtem) a jako druhá pojistka Row Level Security v Postgresu. Admin tabulky ve schématu `public` zůstávají, jak jsou.

| Tabulka | Klíčové sloupce | Účel |
| --- | --- | --- |
| `accounts` | id (Clerk org), název, IČO, tarif, stripe\_customer\_id, stav předplatného | firma = jednotka fakturace |
| `members` | account\_id, clerk\_user\_id, role | kdo má do účtu přístup |
| `businesses` | account\_id, název, slug, obor, barva, logo | byznys uvnitř účtu |
| `business_modules` | business\_id, modul, zapnuto | přepínače modulů |
| `services` | business\_id, název, délka\_min, cena, aktivní, na\_webu | ceník a délky slotů |
| `staff` | business\_id, member\_id nebo jméno, směny | kdo dělá termíny |
| `field_definitions` | business\_id, klíč, popisek, typ, povinné, volby, pořadí, na\_webu | vlastní kolonky |
| `stages` | business\_id, název, pořadí, typ (nová / rozpracovaná / hotová / zaplacená / zrušená) | vlastní stavy |
| `customers` | account\_id, jméno, telefon, e-mail, narozeniny, poznámka, souhlas s kontaktem, segment | zákazník; rozpozná se podle telefonu nebo e-mailu |
| `requests` | business\_id, customer\_id, služba, chtěný termín, hodnoty kolonek (jsonb), zdroj, externí ID | poptávka |
| `jobs` | business\_id, customer\_id, request\_id, stage\_id, cena, záloha, veřejný token | zakázka a klientský portál |
| `appointments` | business\_id, job\_id, staff\_id, začátek, konec, stav | termín; výlučné omezení na překryv per pracovník |
| `loyalty_programs` | business\_id, razítek\_do\_odměny, co\_se\_počítá, min\_útrata, platnost\_měsíců, odměna | nastavení věrnosti |
| `loyalty_cards` + `loyalty_events` | customer\_id, program\_id, razítka / změna, důvod, appointment\_id | karta a historie razítek; 1 návštěva = nejvýš 1 razítko |
| `segment_rules` + `segment_history` | business\_id, hranice / customer\_id, z, do, kdy | segmenty a jejich změny |
| `invoices`, `transactions` | account\_id, business\_id, částka, měna, splatnost, zaplaceno | faktury, příjmy a výdaje |
| `tax_settings` | account\_id, režim (paušální výdaje / skutečné / paušální daň), plátce DPH | vstup pro odhad daní |
| `web_integrations` | business\_id, veřejný klíč, hash tajného klíče, povolené domény | napojení webu a e-shopu |
| `subscriptions`, `stripe_events` | account\_id, stav, tarif / id události | Stripe a idempotence webhooků |
| `api_requests`, `audit_log`, `notifications` | — | rate limit, kdo co změnil, upozornění |

**Příjem poptávek:** `POST /api/public/v1/requests` s veřejným klíčem byznysu (widget na webu, kontrola domény přes CORS) nebo s tajným klíčem (e-shop a server-server). Validace podle `field_definitions` byznysu, rate limit, přiřazení zákazníka podle telefonu nebo e-mailu, notifikace a e-mail. Vložení na web jedním řádkem `<script>` (C4). Nové poptávky se v otevřené aplikaci objeví do 15 sekund (pravidelné dotazování), živé připojení přes WebSocket až později.

**GDPR:** export všech dat účtu, smazání zákazníka na žádost, zpracovatelská smlouva mezi mnou a klientem, souhlas s kontaktováním u zákazníka (bez něj ho panel „Komu napsat“ nenabídne).

## Plán pro Claude Code

**Aktualizace 8. 10.:** fáze níže jsou rozpracované do 20 sezení S00–S19 v sadě pro Claude Code (`prompts/`, `CLAUDE.md`, `AGENTS.md`, skilly `zakaziq-*`, paměť `memory/`). Pro pořadí a obsah platí sada. Cesty veřejných částí: aplikace `/w`, objednávací stránka `/r/[slug]`, widget `/embed/[slug].js`, klientský portál `/z/[token]` (admin portál `/p/[token]` zůstává).

Stavíme v tomto repu na samostatné větvi `workspace`, po fázích a každou fázi v nové konverzaci s Claude Code. Každá fáze končí kontrolou, že admin konzole funguje beze změny.

1. **Příprava.** Větev, nová sekce „Workspace“ v `CLAUDE.md`, závislosti (Clerk, Stripe, shadcn/ui), design systém Dílky (tokeny, písma, animace) pro Workspace, klientský portál a landing page, složený `middleware.ts`, doplněný `.env.example`. *Hotovo, když:* `/login`, `/dashboard`, `/alteno`, `/hub` a `/p/[token]` vypadají a fungují jako předtím a `npm run build` a `npm test` procházejí.
2. **Landing page.** `/` podle sekce Landing page, footer s odkazem Admin, responzivní, metadata. *Hotovo, když:* stránka je statická, funguje na telefonu a kontaktní formulář založí poptávku v adminu.
3. **Základ více klientů.** Schéma `ws` (migrace od 064), DB role, Row Level Security, webhook Clerk, `requireWorkspace()`, průvodce Nový byznys se šablonami oborů (C5). *Hotovo, když:* dva testovací účty navzájem nevidí data, ověřené testem.
4. **Jádro.** Rozložení aplikace (postranní panel, přepínač byznysů, ⌘K), obrazovky Dnes, Poptávky, Kalendář, Zákazníci, veřejné API (schema + requests), tlačítko „Zkopírovat prompt pro Claude Code“, skill zakaziq-napojeni, stránka pro objednání a záložní widget. *Hotovo, když:* poptávka z testovací stránky se do 15 s objeví v kalendáři jako čárkovaný blok a jde potvrdit jedním klikem.
5. **Nastavení.** Moduly, služby, kolonky s náhledem (C4), stavy, otevírací doba, pracovníci, napojený web. *Hotovo, když:* vypnutý modul zmizí z menu a nová kolonka se hned ukáže ve widgetu.
6. **Věrnost a segmenty.** Program, karty, razítka, segmenty, panel „Komu napsat“, připomínky. *Hotovo, když:* testy pokrývají pravidla razítek a všech pěti segmentů.
7. **Peníze.** Faktury, příjmy a výdaje, daně; logiku přenést z `lib/tax.ts`, `lib/invoices.ts`, `lib/invoice-ai.ts` do `lib/ws/` bez změny původních souborů. *Hotovo, když:* částky v CZK a EUR se nikdy nesčítají dohromady a daňový panel je označený jako odhad.
8. **Stripe.** Jeden tarif 249 Kč měsíčně, Checkout napojený na registraci z landing page, webhook, `hasActiveSubscription()`, Customer Portal, režim jen pro čtení. *Hotovo, když:* celý cyklus projde ve Stripe test režimu včetně neúspěšné platby. Registrace s platbou musí být hotová před spuštěním landing page pro veřejnost.
9. **Admin doplněk.** `/dashboard/klienti` (přehled účtů, založení klienta, klíče k webu). *Hotovo, když:* klienta založím a napojím na jeho web bez SQL.
10. **Doladit a spustit.** Mobilní verze (D), tmavý režim, export a smazání dat, právní stránky, bezpečnostní hlavičky, první pilotní klient.

**Pravidla pro Claude Code** (vložit do `AGENTS.md`):

- Neměnit soubory admin konzole (`app/dashboard`, `app/alteno`, `app/hub`, `app/(auth)`, `app/*-actions.ts`, `lib/business.ts`, stávající komponenty). Co se přebírá, se kopíruje do `lib/ws/` a `components/ws/`.
- Nový kód: `app/(marketing)/` pro landing page, `app/w/` pro Workspace, `app/api/ws/` a `app/api/public/v1/` pro API.
- Každý dotaz do `ws` jde přes `requireWorkspace()` a filtruje `account_id`. Nikdy nečíst `account_id` z formuláře.
- Nová DB změna = nová idempotentní migrace v `migrations/`.
- Vzhled jen podle systému Dílky: barvy přes tokeny navy a signal, žádné natvrdo zapsané barvy Tailwindu; každá nová obrazovka se porovná s mockupem LP-D a pravidly pohybu.
- Časy přes helpery Europe/Prague, kolize termínů řeší DB omezení, ne kontrola před vložením.
- Každá fáze: testy (Vitest), `npm run build`, kontrola admin stránek, commit s popisem.

**První prompt pro Claude Code:** „Přečti `CLAUDE.md` a dokument ZakazIQ Workspace. Proveď fázi 1 (Příprava) na větvi `workspace`. Neměň žádný soubor admin konzole. Na konci ověř, že `/login`, `/dashboard`, `/hub` a `/p/[token]` fungují jako předtím, a vypiš změněné soubory.“

## Otevřené otázky

Tyto body je potřeba rozhodnout před fází, kterou ovlivňují.

- [x] Cena 249 Kč měsíčně je rozhodnutá. Rozhodnuto 8. 10. 2026: konečná cena bez DPH (neplátce), 14 dní zdarma bez karty, v ceně 1 byznys a neomezeně pracovníků.
- [x] Doména Workspace: běží landing page i aplikace na jedné doméně (např. zakaziq.cz + `/w`), nebo aplikace na subdoméně? Rozhodnuto 8. 10. 2026: jedna doména, aplikace na /w.
- [ ] Admin přihlášení: nechat NextAuth natrvalo, nebo později převést admina na Clerk s rolí admin a mít jeden způsob přihlášení?
- [ ] SMS: který poskytovatel pro připomínky a „Komu napsat“, a platí SMS klient zvlášť?
- [ ] Zálohy online: chceme ve fázi 1 přijímat platby od zákazníků firem (Stripe Connect), nebo až později?
- [ ] Právní stránka: obchodní podmínky, zpracovatelská smlouva a zásady ochrany údajů; kdo je připraví. Do spuštění jsou na landing page zástupně \[DOPLNIT\].
- [ ] Daňové údaje: aktuální limit pro registraci k DPH a sazby pro odhad je nutné ověřit před spuštěním modulu Daně.
- [ ] Obory: které šablony chceme mít hotové při spuštění a který klient bude první pilotní (např. kadeřnictví).
- [ ] Další byznys na účtu: kolik bude stát a kdy ho zapnout?
