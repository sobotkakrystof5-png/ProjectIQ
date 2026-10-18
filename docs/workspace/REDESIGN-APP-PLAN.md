# Redesign aplikace Workspace — plán implementace

**Stav:** odsouhlaseno 2026-10-18 (R-058), rozfázované na sezení RD00–RD16. Průběh po sezeních v sekci 5.
**Zadal:** Kryštof, 2026-10-18. **Navazuje na:** R-057 (landing a kalendář jako hlavní plocha), `docs/REDESIGN-HANDOFF.md`.
**Rozsah:** aplikace `/w/[byznys]` + veřejná objednávka `/r` a widget. Landing je hotová. Admin se nemění (výjimka v RD11, jen s výslovným souhlasem).
**Jak se podle plánu pracuje:** jedno sezení = jedna nová konverzace v Claude Code. Prompty jsou v `new - area of zakaziq/prompty/redesign/` (rozcestník `00-README.md`), tabulka stavu je v sekci 5.

## 1. Co chceme (Kryštofovými slovy, upřesněno)

1. Aplikace je jednodušší, přehlednější a hlavně **rychlejší**. Dnes působí složitě.
2. Lepší rozložení **kalendáře** a **zakázek**, chytřejší kalendář (Workspace, ne admin).
3. **Rezervační systém dobrý pro všechny**: zákaznická objednávka, vaše rezervace z kalendáře, více služeb, pracovníci, kapacita.
4. **Fakturace** rychlejší a lepší.
5. **Věrnostní karty** jednodušší.
6. **Daně a přehled**: jednodušší, údaje jednotlivých uživatelů **anonymní** (výklad ke schválení, D-1).
7. **Nastavení funkcí** s lepším poměrem jednoduchosti a možností.
8. Nová sekce **Návody** se samostatnými záložkami: jak aplikaci využít co nejefektivněji.
9. Lepší vnitřní vizuál celé aplikace (v systému Dílky).
10. **Nastavení pryč z hlavního menu, do Účtu** (dnes tam překáží). Rozhodnuto 2026-10-18.
11. **Kontakt zákazníka:** telefon a e-mail jsou vždy po ruce, chybějící se doplní na místě a e-mail se pošle **jedním klikem**, stejně jako v adminu v sekci Hovory (D-10).

## 2. Co jsem našel v kódu

| Oblast | Zjištění |
|---|---|
| Rychlost | Neon je ve Frankfurtu (`eu-central-1`), `vercel.json` nemá `regions` (funkce nejspíš běží v USA, ověřit). Navigace dělá kola: Clerk → `account_by_clerk_org` → `requireBusiness` → layout (5 dotazů + billing) → stránka; každý dotaz je samostatný HTTP požadavek do DB. V `app/w` není žádný `Suspense`, jediný `loading.tsx` je pro Dnes. Živé obnovení dělá po změně celé `router.refresh()`. |
| Navigace | Na počítači 9 položek: Dnes, Poptávky, Kalendář, Zákazníci, Zakázky, Faktury, Příjmy, Daně, **Nastavení**, pod nimi Účet a Odhlásit. Faktury, Příjmy a Daně jsou zvlášť a stránka Peníze má navíc vlastní záložky stejného obsahu. Na telefonu už je jedno „Peníze“. Nastavení stojí mezi pracovními částmi, i když se používá zřídka. |
| Dnes | Tři sloupce (Příchozí, týden, karta zákazníka) + pravý panel. Hodně informací najednou, žádná jedna hlavní věc. |
| Zakázky | Tabule se sloupci 280 px s vodorovným posunem, jen myš a výběr stavu, žádný seznam. |
| Peníze | `components/ws/money/page.tsx` je husté (řádky přes 300 znaků), jedna stránka drží 4 záložky, přepínač rozsahu, měsíc, graf, 3 rozpady a daně. Načítá 12 měsíců plateb a až 500 faktur a sčítá v JS. |
| Faktura | Formulář má přes 20 polí. Dodavatel se předvyplní jen jménem a IČO, splatnost je výchozí dnes, položky nejdou vzít z ceníku služeb, „Zaplaceno“ chce datum a způsob. |
| Daně | Nastavení má 12 polí (režim, paušál, pásmo, měsíce, 4 zaškrtávátka, zálohy, způsob podání). Čísla jsou pod dlouhými vysvětlivkami. |
| Rezervace | Model počítá s **jednou službou** a **jedním pracovníkem** na termín, bez kapacity. Překryv hlídá `EXCLUDE` na pracovníka (R-005). Více služeb a kapacita proto potřebují změnu dat. |
| Nastavení | 10 podstránek, 11 přepínačů funkcí, každý formulář má vlastní Uložit. |
| Věrnost | Nastavení má asi 10 voleb (počítání, částka na razítko, služby, minimum, 1 za den, platnost, automaticky…). |
| Kontakt a e-mail | Zákazník má `phone` (E.164) a `email`, oboje jedinečné na účet. V rezervačním formuláři jsou „nepovinné“, na kartě jsou jen odkazy `tel:` a `mailto:` (otevřou poštovní program). „Komu napsat“ posílá jen automatické návrhy a jen se souhlasem, žádné ruční „Napsat zákazníkovi“. Chybějící e-mail se na kartě nedá doplnit na místě. V adminu Hovory je e-mail u kontaktu, okno s předvyplněnou zprávou a Odeslat jedním klikem se štítkem „Odesláno“. |
| Admin a soukromí | `lib/ws/admin/clients.ts` čte jen souhrny (počty, stav předplatného, poslední aktivita) a e-maily členů týmu. Role vlastníka tabulek a Neon konzole ale technicky vidí všechno. |

## 3. Pravidla pro všechny kroky

- Jedna hlavní akce na obrazovce, detail v pravém panelu, nejvýš 2 kliky z Dnes, obyčejná čeština, plochy ≥ 44 px (AGENTS.md, B8–B11).
- **Rychlost je rozpočet, ne přání.** Cíl: po kliknutí se kostra obrazovky ukáže hned (< 100 ms), obsah do ~600 ms na běžném připojení. Čísla se měří před a po (RD00, RD02), do paměti jdou jen naměřená.
- Jen Dílky, žádné barvy natvrdo, tmavý režim, `prefers-reduced-motion`. Animace jen u změny stavu.
- Změna DB = nová idempotentní migrace od **085**. Migrace aplikuje Kryštof sám. Žádný seed na produkční Neon bez souhlasu.
- Admin, `lib/*.ts` a `components/*.tsx` mimo `ws` se nemění.
- Staré adresy zůstávají funkční (přesměrování), aby se nerozbily odkazy z e-mailů, ⌘K a záložky.
- Po každém sezení: `npx tsc --noEmit`, `npm test`, `npm run build:check`, vzhled na 390 / 768 / 1280 / 1440 px, zápis do `memory/` (changelog, případně R-xxx), řádek ve stavu v sekci 5. Co nešlo ověřit s přihlášením, se tak označí.

## 4. Obsah fází (v závorce sezení)

### F0 — Příprava (RD00)
- Pracovní strom má 64 neuložených souborů (S19, migrace 080, landing, paměť). Cizí změny nestaguji. Potřebuji pokyn, jak je uložit (D-7).
- Nová větev `ws/redesign-app` z `ws/s18`.
- Bezpečné testovací prostředí: `.env.local` míří na produkční Neon. Navrhuji **Neon branch** pro vývoj redesignu (D-8).
- Odsouhlasená rozhodnutí D-1–D-10 jako R-058 do `memory/memory.md`.
- **Měření:** výchozí čísla (čas po kliknutí na Dnes, Kalendář, Peníze; počet kol do DB).

### F1 — Menu a Účet (RD01)
- Hlavní menu na počítači: **Dnes, Poptávky, Kalendář, Zákazníci, Zakázky, Peníze** (Návody přibydou v RD14). Faktury, Příjmy a Daně jen jako záložky uvnitř Peníze, jedno místo, žádné duplicity. Položka Peníze vede na první zapnutou peněžní funkci.
- **Nastavení pryč z hlavního menu.** Dole v liště jedno tlačítko **Účet** (jméno firmy / iniciála), které otevře malé menu: Nastavení firmy · Předplatné a doklady · Vzhled · Zpracování údajů · Odhlásit. Na telefonu stejné položky v menu pod oddělovačem.
- Adresy `/w/[byznys]/nastaveni/*` se **nemění** (žádné rozbité odkazy, e-maily ani ⌘K), mění se jen cesta k nim. ⌘K dál umí „Nastavení“.
- Nevlastník (pracovník) vidí v Účtu jen Vzhled a Odhlásit. Dnes se mu na Nastavení ukáže jen věta, že ho mění majitel.
- Známý nedodělek: `/w/ucet` stojí mimo kostru aplikace (Otevřené problémy). Tady se řeší jen odkaz, ne přesun stránky.

### F2 — Rychlost (RD02, RD03)
1. **Region:** `"regions": ["fra1"]` ve `vercel.json` (Hobby dovoluje jeden). Nejdřív ověřit současné nastavení projektu ve Vercelu. Projeví se až po deployi (D-6).
2. **Méně kol do DB:** jedna SQL funkce vrátí účet + byznys + předplatné najednou; data layoutu (byznysy, funkce, upozornění, služby, novinky) jedním `wsDb.batch`. Cíl: nejvýš 2 kola na navigaci (kontext + layout, data stránky).
3. **Streaming:** `loading.tsx` pro každou obrazovku, `Suspense` kolem karty zákazníka, grafu, seznamu faktur a `DetailSlot`, aby panel nikdy neblokoval stránku.
4. **Dotazy (RD03):** součty a rozpady v SQL místo v JS (Peníze), `EXPLAIN` na `getTodayData` a `getFinance`, chybějící indexy do migrace 085.
5. **Klient (RD03):** prefetch odkazů v postranním panelu, optimistické akce tam, kde jich ještě není (zaplaceno, razítko), levnější živé obnovení (`router.refresh()` jen při skutečné změně), dynamický import grafu, `dnd-kit` a `cmdk`.
6. Cache dat účtu jen s klíčem účtu a tagy, jinak ne (oddělení účtů má přednost). Volitelné, rozhodne se podle měření.

### F3 — Dnes a vizuální základ (RD04)
- Dnes odpovídá na „Co mám teď udělat?“: nahoře jedna hlavní věc (poptávka k potvrzení / nejbližší termín / faktura po splatnosti), pod tím den. Týdenní kalendář zůstává (R-057), karta zákazníka se přesune do pravého panelu místo třetího sloupce (D-3).
- Jednotná hlavička obrazovek, hustota, rytmus, prázdné stavy (společné komponenty, které pak používají další sezení).

### F4 — Kalendář a Zakázky (RD05, RD06)
**Kalendář (Workspace):**
- Kompaktní jedna lišta: Den/Týden/Měsíc, šipky, Dnes, + Rezervace.
- Rychlé zadání: klik nebo tažení v mřížce otevře malé okno (zákazník, služba, čas) místo celého formuláře.
- Chytré: při potvrzení poptávky tři nejbližší volné časy a upozornění na kolizi, „najdi volný čas pro službu“, barva podle pracovníka nebo služby, změna délky tažením za spodní okraj, skok na datum. Návrhy volných časů čtou stejná pravidla jako objednávka (jedna logika, `lib/ws/bookings.ts`).
- Telefon: den jako seznam, přejetí mezi dny.

**Zakázky:**
- Přepínač Tabule / Seznam (na telefonu výchozí seznam), kompaktní karta (zákazník, cena, příští termín, stav jako štítek), počty ve sloupcích, filtr „čeká na mě“ a „po termínu“.
- Rychlá akce na hotové zakázce: Vystavit fakturu (je) + Zaplaceno.

### F5 — Rezervační systém (RD07, RD08, RD09)
- **Zákaznická objednávka (`/r`, widget) — RD07:** nejvýš 3 obrazovky, krok služby se přeskočí u jediné služby, nahoře „Nejbližší volný termín“, kalendář dnů s dostupností, výběr pracovníka „kdokoli“ / konkrétní, při obsazení hned nabídnout nejbližší jiný čas, potvrzení s „Přidat do kalendáře“ a odkazem do portálu. Lehčí bundle (animace jen u změny kroku).
- **Vaše rezervace — RD08:** z kalendáře (klik/tažení), z karty zákazníka „Objednat znovu“, ⌘K (existuje). Volitelně opakování („každé 4 týdny“), jen pokud ho chcete (D-5).
- **Více služeb v jedné rezervaci — RD08:** zákazník vybere víc služeb, součet délek, jeden souvislý blok. Datově: `ws.appointments.group_id` (společné potvrzení/zrušení/přesun) + `ws.request_services` (pořadí služeb v poptávce). `EXCLUDE` na pracovníka zůstává, takže kolize hlídá dál DB. Migrace 085 + testy v PGlite.
- **Pracovníci — RD07:** výběr „kdokoli“ spojí volné časy všech, kdo službu dělá. Bez sdílených zdrojů (židle, místnost), to je další úroveň.
- **Kapacita — RD09, volitelné, po D-4:** (1) skupinové termíny s N místy (kurz, lekce) = nová entita `ws.sessions` + `ws.session_attendees`; (2) více zákazníků naráz u jednoho pracovníka. Doporučuji RD08 hotové dřív a kapacitu (1) jako samostatný krok.

### F6 — Fakturace (RD10) — cíl: vystavit za 30 sekund
1. **Profil dodavatele jednou** (Nastavení › Firma): jméno, adresa, IČO, DIČ, účet, plátce DPH. Faktura se už na dodavatele neptá.
2. **Nová faktura na jedné obrazovce:** Komu (hledání zákazníka, z poptávky/zakázky předvyplněno), Co (služby z ceníku jedním klikem, cena předvyplněná), Splatnost (7 / 14 / 30 dnů, výchozí 14), součet. Datum plnění, měna, DPH a poznámka pod „Další údaje“.
3. **Tlačítka:** „Vystavit a poslat“ (do ověření domény v Resendu jen „Vystavit a stáhnout PDF“) a „Jen vystavit“.
4. **Seznam:** filtry K zaplacení / Po splatnosti / Zaplacené, v řádku jedním klikem „Zaplaceno“ (výchozí dnes, převodem; úprava až po, se Zpět).
5. **QR platba na PDF** (SPAYD), nový prvek, potřebuje IBAN (D-5).
6. Refaktor `components/ws/money/page.tsx` do čitelných souborů a segmentů tras.
7. Beze změny: atomické číslování (R-049), PDF přes Puppeteer, měny se nesčítají.

### F7 — Přehled peněz, Daně, soukromí (RD11)
- **Přehled:** nahoře tři čísla (Příjmy, Výdaje, Rozdíl) + „Odložit na daně“ + „Po splatnosti: N“, pod tím graf. Rozpady podle skupin/služeb/zdroje do záložky Rozbory.
- **Daně:** průvodce nastavením se třemi otázkami (OSVČ hlavní/vedlejší, paušál/skutečné výdaje, plátce DPH), hlavní věta „Za 2026 odhadujeme X, odkládejte Y měsíčně“, termíny, pruh k hranici DPH. Podrobnosti rozbalitelné. Sazby a výpočty beze změny (`docs/workspace/MONEY.md`).
- **Soukromí údajů (D-1), tři úrovně:**
  1. *Admin nevidí osobní údaje zákazníků klientů.* Audit `lib/ws/admin/*`, test, který hlídá, že admin nečte obsah tabulek zákazníků, poptávek, faktur ani poznámek. Sahá na admin, jen s výslovným souhlasem.
  2. *Režim soukromí v aplikaci:* částky a jména rozmazané, odkryjí se klepnutím; pamatuje si zařízení. Pro sdílení obrazovky.
  3. *Šifrování citlivých sloupců* aplikačním klíčem, aby je neviděl ani provozovatel v databázi. Rozbíjí hledání, řazení a součty v SQL. Jen pokud chcete slib „nevidím ani v DB“.

### F8 — Věrnostní karty (RD12)
- **Vzhled karty** (`LoyaltyCard`) sjednocený v kartě zákazníka, portálu a e-mailu: razítka jako dílky, „3 z 10“, odměna, platnost.
- **Jednoduchý režim nastavení:** dvě otázky (Kolik razítek? Jaká odměna?) + razítko za zaplacenou návštěvu. Vše ostatní pod „Pokročilé“.
- Razítko a uplatnění odměny jedním klikem z karty zákazníka (se Zpět). Zákazník vidí kartu v portálu `/z`.
- Mimo rozsah: Apple/Google Wallet (nová integrace).

### F8b — Zákazníci: kontakt a e-mail jedním klikem (RD16)
- **Kontakt vždy na očích:** Telefon a E-mail při každém zadání zákazníka pod sebou, povinnost podle D-10 (doporučeno aspoň jedno). Telefon se normalizuje (`+420…`), e-mail na malá písmena.
- **Doplnit na místě:** chybí-li údaj, na kartě, v poptávce, v termínu i v seznamu je „+ Přidat e-mail“ / „+ Přidat telefon“, jedno pole a Enter. Kolize s jiným zákazníkem nabídne sloučení, nikdy tichý přepis.
- **Napsat jedním klikem:** tlačítko **Napsat e-mail** na kartě zákazníka, v poptávce, termínu a seznamu. Malé okno jako v adminu: předvyplněná šablona podle situace (poděkování, termín, volný termín, zakázka, vlastní), **Odeslat**, štítek „Odesláno“ a 60 s „Zpět“.
- **Odeslání:** stávající fronta e-mailů, odesílatel byznys, odpověď na e-mail majitele. Dokud není ověřená doména v Resendu, tlačítko otevře `mailto:` s předvyplněným textem, potom odesílá přímo. Zavolat = `tel:`; SMS a WhatsApp mimo rozsah.
- **Pravidla:** osobní zpráva k obsluze smí odejít vždy, nabídky a akce jen se souhlasem a odhlášením (jako „Komu napsat“). Zprávy zákazníka maže výmaz zákazníka a jsou v exportu.
- Šablony se upravují v Nastavení › Komunikace (RD13); výchozí texty v kódu. Případná migrace: nové typy v `message_settings_type_check`.

### F9 — Nastavení a funkce (RD13)
- Dnešních 10 podstránek na **5 sekcí:** Firma (profil dodavatele, vzhled) · Nabídka (služby, otevírací doba, pracovníci) · Objednávky (formulář, stavy, napojený web) · Zákazníci (věrnost, skupiny) · Komunikace (e-maily, upozornění, šablony zpráv zákazníkům z RD16). Vstup je z Účtu (RD01).
- **Funkce podle oboru:** „Co v aplikaci používáte?“ s hotovou sadou pro obor (kadeřnictví, řemeslníci…), jednotlivé přepínače schované pod „Upravit“. Závislosti (Daně → Příjmy, Hodnocení → Portál) se zapnou samy s vysvětlením.
- **Uložení:** tam, kde to jde, automatické s „Uloženo · Zpět“ místo tlačítka Uložit u každého formuláře.
- **Začátek do 3 minut:** kontrolní seznam na Dnes (služby, otevírací doba, odkaz na objednání), zmizí po dokončení.

### F10 — Návody (RD14)
- Trasa `/w/[byznys]/navody` (nový rezervovaný slug v `lib/ws/paths.ts`), položka v menu.
- **Záložky:** Začínáme · Poptávky a kalendář · Zákazníci a věrnost · Faktury a peníze · Daně · Napojení webu · Zkratky a ⌘K.
- Návod = 3–6 kroků, malý výřez rozhraní, tlačítko „Otevřít tuhle obrazovku“, doba čtení. Malé „?“ v záhlaví obrazovek vede na správnou záložku.
- Obsah jako typovaná data v repu (`lib/ws/guides/`), ne v DB. Texty podle `zakaziq-ux-texty-cs` + `humanize-text-cs`, žádná vymyšlená čísla.
- „Menší kruh“ jsem pochopil jako malý okruh samostatných záložek (D-2).

### F11 — Vizuální sjednocení a závěrečné ověření (RD15)
Průchod všemi obrazovkami: hustota a rytmus, prázdné stavy, ikony, tmavý režim (nové třídy do `app/ws-tokens.css`), animace jen u změn stavu, přístupnost a klávesnice, 390 / 768 / 1280 / 1440 px, průchod s přihlášením na testovacích datech, porovnání naměřené rychlosti s RD00.

## 5. Sezení a stav

Pořadí je doporučené. Po RD04 jsou RD05–RD06, RD10–RD13 na sobě nezávislé a jde je prohodit. RD09 je volitelné. RD16 (kontakt a e-mail jedním klikem) má číslo až na konci, ale doporučené místo je hned za RD12; nezávisí na RD05–RD11.

| Sezení | Obsah | Velikost | Migrace | Potřebná rozhodnutí | Stav |
|---|---|---|---|---|---|
| RD00 | Příprava, větev, testovací DB, měření, R-058 | S | — | D-7, D-8, všechna ke schválení | rozpracováno 2026-10-18: rozhodnutí a R-058 hotové, větev a commity hotové; zbývá Neon branch, měření a průchod s přihlášením |
| RD01 | Menu a Účet: Nastavení do Účtu, Peníze sloučeno | S–M | — | D-9 (rozhodnuto) | hotovo 2026-10-18 (kód, testy, náhled na 4 šířkách světle i tmavě; s přihlášením neověřeno) |
| RD02 | Rychlost I: region, kola do DB, streaming | M | 085 | D-6 | hotovo v kódu 2026-10-18 (region `fra1` v `vercel.json`, kontext jedním dotazem, doplňky kostry streamem, `loading.tsx`, Suspense; migrace 085 aplikovaná (Kryštof, ověřeno čtením 2026-10-18: funkce `ws.business_scope` existuje); **nenasazeno, čas před/po neměřen** — viz oddíl 9) |
| RD03 | Rychlost II: dotazy, indexy, klient, bundle | M | 086 | — | hotovo v kódu 2026-10-18 (indexy, součty plateb v SQL, živé obnovení, balíček −9 až −12 %; migrace 086 aplikovaná (ověřeno čtením 2026-10-18: všech šest indexů existuje, staré dva jsou pryč); **čas na Neonu neměřen, optimistické akce nejsou** — viz oddíl 9) |
| RD04 | Dnes + hlavička + společné komponenty | M | — | D-3 | hotovo v kódu 2026-10-18 (hlavní věc `pickFocus` + `TodayFocus`, karta zákazníka v panelu, `PageShell`/`PageHeader`/`Toolbar`/`PillNav`/`EmptyState compact` na Dnes, Poptávkách, Zákaznících; vzhled ověřen na dočasné stránce s fiktivními daty na 390/768/1280/1440 px světle i tmavě; **s přihlášením neověřeno**) |
| RD05 | Kalendář | M–L | — | — | hotovo v kódu 2026-10-18 (jedna lišta, rychlé zadání z mřížky klikem i tažením, aktuální čas v dnešním sloupci, rady k času a kolize, tři nejbližší volné časy u poptávky, Najít volný čas v ⌘K/menu/panelu, barvy pracovníků a filtr, stínování mimo otevírací dobu a mezery, délka tažením a v detailu, skok na datum, přejetí na telefonu; vzhled ověřen na dočasné stránce s fiktivními daty, **s přihlášením neověřeno**; R-059) |
| RD06 | Zakázky | S–M | — | — | hotovo v kódu 2026-10-18 (tabule i seznam, filtry Čeká na mě / Po termínu / Bez termínu v URL, kompaktní karta, shrnutí, stav a historie stavů v panelu, výběr stavu jako klávesnicová náhrada tažení; historie bez migrace přes `audit_log`; vzhled ověřen na dočasné stránce, **s přihlášením neověřeno**; R-059) |
| RD07 | Zákaznická objednávka `/r` + widget + pracovníci | M–L | — | — | nezačato |
| RD08 | Více služeb + vaše rezervace | L | 085 | D-5 (opakování) | nezačato |
| RD09 | Kapacita / skupinové termíny (volitelné) | L | ano | D-4 | nezačato |
| RD10 | Fakturace | M–L | možná (profil dodavatele) | D-5 (QR) | nezačato |
| RD11 | Přehled peněz, Daně, soukromí | M (+ L při šifrování) | — | D-1 | nezačato |
| RD12 | Věrnostní karty | S–M | — | — | nezačato |
| RD16 | Zákazníci: kontakt a e-mail jedním klikem | M | možná (typy šablon) | D-10 | nezačato |
| RD13 | Nastavení: 5 sekcí, funkce podle oboru, autosave | M | — | — | nezačato |
| RD14 | Návody | M | — | D-2 | nezačato |
| RD15 | Vizuální sjednocení + závěrečné ověření | M | — | — | nezačato |

Stav se po každém sezení přepíše tady (`hotovo YYYY-MM-DD`, co zbylo) a v `memory/memory.md`.

## 6. Rozhodnutí, která potřebuji od Kryštofa

| # | Otázka | Doporučení | Stav |
|---|---|---|---|
| D-1 | **Soukromí:** klienti nemají mít obavu, že jejich zákazníky a částky vidíte vy. Která úroveň (1 admin, 2 režim soukromí, 3 šifrování)? | 1 + 2 teď, 3 jen pro slib „nevidím ani v DB“. | rozhodnuto 2026-10-18: úroveň 1 + 2 |
| D-2 | **Návody:** malý okruh záložek, nebo i plovoucí kruhové „?“ s nápovědou na každé obrazovce? | Záložky + malé „?“ v záhlaví. | rozhodnuto 2026-10-18: ano |
| D-3 | **Dnes:** karta zákazníka z třetího sloupce do pravého panelu? | Ano. | rozhodnuto 2026-10-18: ano |
| D-4 | **Kapacita:** skupinové termíny (kurz s N místy), nebo souběžní zákazníci u jednoho pracovníka? | Nejdřív více služeb (RD08), skupinové termíny samostatně. | rozhodnuto 2026-10-18: nejdřív více služeb, kapacita později |
| D-5 | **Nové prvky:** QR platba na fakturách (potřebuje IBAN), opakované rezervace? | QR ano, opakování později. | rozhodnuto 2026-10-18: QR i opakování ano |
| D-6 | **Region Vercelu** na `fra1` (projeví se po deployi na produkci). | Ano, po ověření v dashboardu. | rozhodnuto 2026-10-18: ano, po ověření v dashboardu |
| D-7 | **Rozpracované změny** (64 souborů): kdo a jak je uloží do commitů, než začneme? | Tři commity: bezpečnost + migrace 080 + balíčky · landing · paměť. | rozhodnuto 2026-10-18: tři commity, schvaluje Kryštof |
| D-8 | **Testovací data:** Neon branch pro vývoj redesignu, v ní seed (R-041)? | Ano. | rozhodnuto 2026-10-18: ano |
| D-9 | **Nastavení** z hlavního menu do Účtu; adresy zůstanou. | Rozhodnuto Kryštofem 2026-10-18. | rozhodnuto |
| D-10 | **Kontakt a e-mail zákazníka (RD16):** (a) povinnost: oba údaje / aspoň jeden / nepovinné? (b) odeslání: přímo z ZakazIQ s odpovědí na váš e-mail (potřebuje ověřenou doménu v Resendu), zatím `mailto:`? (c) pravidlo: osobní zpráva k obsluze vždy, nabídky jen se souhlasem? | (a) aspoň jedno, (b) `mailto:` hned a přímé odeslání po ověření domény, (c) ano. | rozhodnuto 2026-10-18: podle doporučení |

## 7. Rizika

- Obrazovky S09–S18 nebyly dosud ověřené s přihlášením na skutečných datech. Redesign staví na neověřeném základě, proto RD00 počítá s testovací databází.
- RD08–RD09 (více služeb, kapacita) sahají do jádra, které hlídá kolize. Každá změna jde s testy v PGlite a s migrací, kterou aplikuje Kryštof.
- RD13 přesouvá adresy nastavení. Staré odkazy (`/nastaveni/vernost` apod.) zůstanou jako přesměrování.
- Rychlost závisí i na Clerku (`auth()` je další síťové volání). Měření v RD00 ukáže, kolik z času je Clerk.
- Větev `ws/redesign-app` vznikne z `ws/s18`. Pokud se mezitím S19 změní, před každým sezením ověřit, že větev není pozadu.

## 8. Zápis do paměti

Po odsouhlasení plánu (RD00): R-058 (rozsah a pořadí) v `memory/memory.md`. Po každém sezení: changelog + stav v sekci 5.

## 9. Naměřeno

Migrace 085 a 086 jsou aplikované (ověřeno čtením 2026-10-18; `DATABASE_URL_WS` míří na stejný endpoint jako admin databáze a je v ní jeden skutečný účet bez ukázkových dat, takže jde o produkční Neon nebo jeho kopii; seed se nepouštěl). Měření času po kliknutí (RD00, krok 5) zatím neproběhlo: chybí testovací Neon branch a přihlášení v Chromu, a produkční Neon se k měření nepoužívá. Čísla času proto **nejsou**. Co je ověřené:

| Co | Před RD02 | Po RD02 | Jak zjištěno |
|---|---|---|---|
| Region funkcí na Vercelu | `iad1` (USA) u posledního nasazení, DB ve Frankfurtu (`eu-central-1`) | `fra1` v `vercel.json`, **projeví se až po deployi** | Vercel MCP `get_deployment` (poslední Preview) + host v `DATABASE_URL_WS` (jen region) |
| Dotazy do DB, než stránka začne číst svá data (po sobě) | 3 kola: účet → byznys ∥ předplatné → funkce, byznysy, zvonek, služby, novinky (8 požadavků celkem) | 1 kolo (`ws.business_scope`); doplňky kostry (1 požadavek) běží zároveň se stránkou | z kódu; po RD02 čítačem v testu `ws-request-scope.test.ts` (stejný test ověřuje 2 požadavky za kostru: kontext + doplňky) |
| Co blokuje první vykreslení kostry | všechny 3 kola | jen kontext (1 kolo) | z kódu, streamování ověřeno na dočasné stránce: první bajt 60 ms s hotovou kostrou, zvonek dorazí v témže HTML po uměle zpožděném promise (1,5 s) |
| Clerk `auth()` | neměřeno | neměřeno | — |

Zbývá změřit s přihlášením na testovací větvi: čas do kostry a do obsahu pro Dnes, Kalendář, Zákazníci, Peníze, před (větev `ws/redesign-app` bez commitu RD02) a po. Dokud nejsou čísla, tvrzení „rychlejší“ platí jen o počtu kol, ne o milisekundách.

### RD03 — dotazy, živé obnovení, balíček (2026-10-18)

**Dotazy.** `EXPLAIN (ANALYZE)` na skutečných dotazech aplikace v PGlite (Postgres ve WASM) nad syntetickými daty: 2 účty, na každém 5 000 zákazníků a 20 000 poptávek, termínů a plateb (platby 2025–2026), 3 000 faktur. **Čísla jsou z PGlite, ne z Neonu**: absolutně zkreslená (WASM je pomalejší), poměr před/po ale platí. „Před“ = bez migrace 086, „po“ = s ní.

| Dotaz | Před | Po | Příčina |
|---|---|---|---|
| Seznam zákazníků (`getCustomersList`) | 563 ms | 46 ms | součet plateb zákazníka procházel 20 000 plateb pro každý ze 300 řádků; index `transactions_customer_idx` |
| Seznam zákazníků s hledáním | 216 ms | 26 ms | totéž |
| Poptávky, záložka Nové (`getRequestsList`) | 543 ms | 44 ms | nejnovější termín poptávky procházel všechny termíny pro každý z 200 řádků; index `appointments_request_idx` |
| Otisk změn pro živé obnovení (`getChangeStamp`) | 20–22 ms | < 0,1 ms | `count(*)` + `max` přes všechny řádky; teď jen `max(updated_at)` z indexu (účet, byznys, updated_at DESC) |
| Platby za 12 měsíců | 58 ms, 10 578 řádků | 33–35 ms, 48 řádků (součty ze SQL) | graf, srovnání s minulým měsícem a Daně už nečtou řádky; řádky se čtou jen za zvolený měsíc (20 ms, ~900 řádků) |
| Dnes (`getTodayData`), Kalendář týden, Zakázky, Faktury, měsíční metriky | 2–8 ms | beze změny | bez zásahu |

Rozpady „podle skupin, služeb a zdroje“ jsem do SQL nepřesouval: počítají se z řádků zvoleného měsíce, které se stejně vykreslují v seznamu plateb, takže další dotaz by nic neušetřil. Shodnost součtů ze SQL s výpočtem nad řádky hlídá `ws-money-totals.test.ts` (po měsících a měnách, hranice měsíců, zkušební poptávky, `all`, cizí účet).

**Živé obnovení.** Dotaz na změny běžel každých 10 s u každé viditelné karty a dělal 4 dotazy za sebou do DB (účet, byznys, odeslání e-mailů, otisk) a čekal na SMTP až 1,5 s. Teď jeden dotaz na kontext (`loadBusinessScope`), otisk druhým a e-maily po odpovědi (`after`). Skrytá karta se dál neptá a `router.refresh()` běží jen při změně otisku (to už platilo).

**Balíček (první načtení JS, gzip, `route-bundle-stats.json` z `next build`):**

| Trasa | Před | Po |
|---|---|---|
| `/w/[business]` (Dnes) | 334 kB | 302 kB (−9 %) |
| `/w/[business]/kalendar` | 335 kB | 303 kB |
| `/w/[business]/penize` | 333 kB | 301 kB |
| `/r/[slug]` (objednávací stránka) | 211 kB | 186 kB (−12 %) |
| `/z/[token]` | 212 kB | 187 kB |
| `/` (landing) | 223 kB | 198 kB |

Příčiny: `WsRoot` importoval celý Framer Motion (43 kB gz v každé stránce), teď `LazyMotion` s `m` a funkcemi načítanými až po vykreslení (`lib/ws/motion-features.ts`), a `app-frame` importoval cmdk jen kvůli zkratce ⌘K (hook je teď v `components/ui/use-command-shortcut.ts`, paleta se načte v klidu nebo při prvním otevření). Stráží to `ws-bundle-guard.test.ts`. Graf je obyčejné SVG (žádná knihovna) a `@dnd-kit` je jen na stránkách Nastavení, takže tam se nic neměnilo.

**Neprovedeno z RD03:** (1) čas po kliknutí na Neonu a s přihlášením (chybí testovací větev a přihlášení), (2) optimistické akce (potvrzení poptávky, zaplacení faktury, razítko): dělají vlastní stavy rozhraní, které bez ověření s přihlášením nejde bezpečně dodělat naslepo, vhodnější je RD04, kde se seznamy stejně přepracovávají, (3) začátek každé server action má pořád 3 dotazy za sebou (účet, byznys, předplatné); po přesunu do `fra1` to jsou jednotky milisekund, tak jsem na ~25 místech nic nepřepisoval, (4) cache dat účtu, protože měření ji neukázalo jako nutnou.
