# Peníze ve Workspace (S14, RD10)

Kód je v lib/ws/money/ a components/ws/money/. Obrazovky /w/[byznys]/{penize,faktury,prijmy,dane} jsou oddělené od adminu. Parametr rozsah=ucet zahrne všechny byznysy účtu, mesic=YYYY-MM vybere měsíc. Daně jsou vždy za celé IČO. Vypnutí modulu nemaže data.

## Faktury a platby

Vystavení ručně nebo z hotové/zaplacené zakázky. Položky, CZK/EUR, údaje dodavatele a odběratele, datum vystavení/plnění/splatnosti, DPH 0/12/21 %, poznámka. Dodavatel musí mít IČO a adresu, plátce také DIČ. Údaje jsou snímek dokladu.

Řada YYYY-NNNNNN je společná účtu. Funkce ws.money_issue zamkne účet a ve stejné transakci přidělí číslo a vloží fakturu; chyba vrátí i počítadlo. Jedna nestornovaná vystavená faktura za zakázku. Existující čísla zůstávají.

Profil dodavatele je uložený jednou v `ws.accounts.invoice_profile` a upravuje ho pouze vlastník v Nastavení › Firma a fakturace. Při vystavení se údaje zkopírují do faktury; pozdější úprava profilu starší doklady nemění. Nová faktura nabízí zákazníka nebo hotovou zakázku, předvyplní známé údaje, dovolí vložit službu z ceníku jedním klikem a má výchozí splatnost 14 dní. Datum plnění, měna, DPH a poznámka jsou pod „Další údaje“.

Funkce ws.money_pay zamkne fakturu a zapíše příjem/výdaj právě jednou. Nezaplacená faktura příjem nevytváří. Stejnou již evidovanou platbu zakázky převezme; odlišné či částečné platby vyžadují ruční kontrolu. Trigger money_adopt_visit hlídá také opačné pořadí: faktura zaplacena před návštěvou.

Seznam vystavených faktur má filtry K zaplacení / Po splatnosti / Zaplacené a součet zvlášť pro každou měnu. „Zaplaceno“ zapíše platbu dnešním datem a převodem; „Zpět“ je dostupné 8 sekund v rozhraní a databáze ho přijme nejvýše 60 sekund. Migrace 088 označuje nově vytvořenou platbu proti převzaté. Zpět smaže jen nově vytvořený příjem, pokud ho mezitím nepoužila návštěva; existující platbu zakázky nebo příjem navázaný na termín od faktury odpojí a zachová.

PDF obsahuje QR platbu SPAYD jen u nezaplacené vystavené faktury v CZK a pouze při platném IBANu s kontrolním součtem. Běžné číslo účtu ani EUR QR nevytvoří. Bez připraveného odesílání (ověřená odesílací adresa v `WS_EMAIL_FROM`, `RESEND_API_KEY` a zapnutá šablona faktury) se nabídne vystavení a stažení PDF; jinak lze odeslat přes existující frontu S15.

Přijaté PDF max. 4 MB, kontrola magic bytes %PDF-, soubor v DB pod RLS, stažení jako příloha. AI přepis je volitelný, max. 10/h na účet, přes existující serverový ANTHROPIC_API_KEY (případně ANTHROPIC_AUTH_TOKEN). Model je převzatý z adminu; přepis vyčítá dodavatele a nikdy nenastavuje zaplacení. Uživatel ověří hodnoty před uložením. Chyba umožní ruční zadání.

PDF vystavené faktury kreslí stávající Puppeteer/Chromium. Instrument Sans a JetBrains Mono jsou vložené lokálně včetně licencí OFL, barvy ze společných ws-tokens.css. Logo: HTTPS PNG/JPEG do 512 kB, veřejná připnutá IPv4, bez redirectů; neplatné/nedostupné logo nahradí znak Dílky. Chromium nemá JavaScript ani síť. Textová data se escapují.

GET /api/ws/[byznys]/faktury/[id]/pdf vyžaduje přihlášení, správný účet/byznys a zapnuté Faktury. Odpověď private/no-store, attachment; generování max. 20/10 min na účet.

**„Připravit e-mail“ vytvoří koncept ve ws.outbound_messages, nic neodesílá.** Typ invoice, payload.invoiceId. S15 doplní šablonu, PDF přílohu a běh fronty.

## Přehledy

Částky v haléřích, součty oddělené podle měny. Ruční platby, zaplacené faktury a návštěvy jsou ve stejné evidenci. Graf 6/12 měsíců, srovnání měsíce, příjmy podle skupiny zákazníka, služby a zdroje poptávky. Skupina je aktuální stav zákazníka, nikoli historická rekonstrukce. Zkušební poptávky se vynechávají. Archiv ukáže 500 nejnovějších faktur, další lze najít přes ⌘K.

## Daně: rozsah odhadu

Výdajový paušál 30/40/60/80 % se stropem, skutečné výdaje nebo paušální daň s ruční volbou pásma. Nastavení obsahuje počet měsíců činnosti, hlavní/vedlejší činnost, minimum zdravotního pojištění, celou slevu na poplatníka a zaplacené zálohy. Nárok na režim a pásmo musí uživatel ověřit. Skutečné výdaje musí zahrnovat jen daňově uplatnitelné částky.

Výpočet je jen pro 2026. Jiný rok, plátce DPH nebo příjmy/výdaje v EUR výpočet skryjí: bez odpočtu DPH a převodního kurzu by nebyl správný. Nezahrnuje příjmy mimo účet, souběh zaměstnání, děti, jiné slevy/odpočty, snížená minima začínající OSVČ a další výjimky. Uživatel vypne slevu již využitou v zaměstnání. Odhad není daňové poradenství.

DPH se posuzuje za **kalendářní rok**, hranice 2 000 000 a 2 536 500 Kč. Posledních 12 měsíců jsou jen přehled. Evidované příjmy a výhled jsou orientační vodítko, **ne zákonný obrat DPH**, který vychází z uskutečněných plnění v tuzemsku. Překročení příjmů vyvolá výzvu ke kontrole s účetní.

Termíny přiznání/paušálních záloh lze přidat do kalendáře přes /api/ws/[byznys]/dane/kalendar (ICS, připomínka 7 dní předem). E-mailové připomínky patří do S15. Lhůty přehledů pojistného závisí na skutečném podání přiznání, proto je UI automaticky nepředepisuje.

## Ověřené zdroje (2026-10-10)

- [Finanční správa: DPH za kalendářní rok a obě hranice](https://app.fs.gov.cz/dotazy-verejnosti/dotaz/termin-pro-podani-prihlasky-k-registraci-platce-dph-1493).
- [Finanční správa: výdajové paušály a stropy](https://financnisprava.gov.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby/podnikatel-osvc).
- [Portál veřejné správy: 15/23 %, hranice 36násobku průměrné mzdy](https://portal.gov.cz/informace/INF-293).
- [Finanční správa: základní sleva 30 840 Kč](https://financnisprava.gov.cz/cs/dane/dane/dan-z-prijmu/zamestnanci-zamestnavatele/dotazy-a-odpovedi/2026/aktualni-dotazy-a-odpovedi-k-dani-z).
- [ČSSZ: mzda 48 967 Kč, vedlejší činnost 117 521 Kč, maximální základ](https://www.cssz.gov.cz/web/cz/-/prehled-nejdulezitejsich-udaju-pro-socialni-zabezpeceni-v-roce-2026).
- [MPSV: snížení rozhodné částky o 9 794 Kč/měsíc bez činnosti](https://mpsv.gov.cz/socialni-pojisteni).
- [ČSSZ: zpětně snížené minimum hlavní činnosti pro rok 2026](https://www.cssz.gov.cz/-/informace-pro-osvc-o-zmene-pojistneho-na-duchodove-pojisteni-od-1-7-2026).
- [ČSSZ: sazba 29,2 %, podíl 55 %, minimum vedlejší činnosti](https://www.cssz.cz/documents/20143/3201321/OSV%C4%8C25%2BTabulka%2Bminim.pdf/5b32ce97-b032-18b0-febb-a75951bdf7e5).
- [VZP: 13,5 % z 50 % základu a minimum](https://www.vzp.cz/platci/informace/osvc).
- [Finanční správa: po novele první pásmo 9 162 Kč zpětně za 2026; pásma 2/3](https://financnisprava.gov.cz/cs/dane/dane/dan-z-prijmu/pausalni-dan/informace-k-institutu-pausalni-dane-pro-rok-2025).
- [Finanční správa: termíny](https://financnisprava.gov.cz/cs/danovy-kalendar).

Admin lib/tax*.ts má historické hodnoty a zůstává beze změny. Neslouží jako zdroj sazeb Workspace.

## Instalace a ověření

Základ peněz tvoří [080_ws_penize_provoz.sql](../../migrations/080_ws_penize_provoz.sql), která se po migracích 078/079 ručně aplikuje v Neon SQL editoru rolí vlastníka. Idempotentní: nové sloupce, omezení, SECURITY INVOKER funkce a EXECUTE pro ws_app. Nevkládá ukázková data. Pokud starší data obsahují více transakcí za jednu fakturu, unikátní index migraci zastaví; záznamy se automaticky nemažou.

RD10 přidává [088_ws_faktury_profil_a_zpet.sql](../../migrations/088_ws_faktury_profil_a_zpet.sql): profil dodavatele na účtu, původ platby a bezpečnou SECURITY INVOKER funkci `ws.money_unpay`. Aplikovat ručně po předchozích migracích Workspace; připravená, dosud neaplikovaná na Neonu. RD16 používá [089_ws_rucni_zpravy_zakaznikum.sql](../../migrations/089_ws_rucni_zpravy_zakaznikum.sql) (rozšíření typu šablon), také jen připravenou; RD08 bude následovat jako 090. Migrace se v tomto sezení nespouštěla.

Běžné testy: npm test, npx tsc --noEmit, izolovaný produkční build. Skutečné PDF: WS_PDF_SMOKE=1 npx vitest run lib/ws/__tests__/ws-money.test.ts (vyžaduje místní Chrome / CHROME_PATH). Běžná sada ho přeskočí pro prostředí bez browseru. Po aplikaci migrace projít obrazovky s přihlášením, vystavení z hotové zakázky a PDF. Testy používají místní PGlite a fiktivní data; nevytvářejí skutečný doklad ani e-mail.
