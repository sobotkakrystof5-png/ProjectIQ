# Navrhovač nabídek — plán

> Systém, který k firmě nebo kontaktu na pozadí stáhne a rozebere web, udělá rešerši z veřejných
> zdrojů, odhadne, **jakou hodnotu web klientovi přinese**, a z ní navrhne cenu nabídky ve třech
> variantách. Navrhuje, nerozhoduje: cenu potvrdí a pošle Kryštof. Učí se ze zpětné vazby (jakou
> cenu Kryštof poslal, co klient odpověděl, co web klientovi pak skutečně přinesl), ne dotrénováním
> modelu. Rozhodnutí **R-147**.
>
> Stav: **N0 hotové** (2026-11-25, pravidla v oddílu 5). **N1 na produkci** (2026-11-26, migrace 136 a 137),
> naostro nevyzkoušené. **N2–N4 na produkci** (2026-11-27, `afe75fc`, migrace 142, R-155), naostro nevyzkoušené.
> 2026-11-28 Kryštof potvrdil Plus a e-shop a rozhodl, že pásmo určuje **přínos webu za měsíc** (zakázky z webu
> za měsíc × cena zakázky, R-157); na produkci od 2026-11-28 (`eed30ca`), naostro nevyzkoušené.
> **N4 na produkci od 2026-11-28 (R-158, `159b8de`):** rozbor se spouští sám (souhlas firmy od asistenta, poptávka z webu)
> a u konceptu nabídky jsou návrhy vstupů ze schůzky ve Voice (oddíl 13).

## 1. Proč a co z toho má být

Kryštof cenu neodvozuje z hodin, ale z toho, **jakou hodnotu zakázka klientovi přinese**
(2026-11-25). Dnes ji odhaduje z hlavy a píše ručně do šablony „Nabídka" (R-132); ceník vizeon.cz
je jen rozmezí („od"). Cíl:

- k firmě do pár minut **rozbor** (web, firma, konkurence) se zdroji ke každému tvrzení,
- **odhad hodnoty** pro klienta: kolik pro něj znamená jedna zakázka, kolik poptávek může web
  přinést, o co dnes bez dobrého webu přichází,
- **tři varianty ceny** (Základ, Doporučená, Plus): co obsahují, cena a krátké zdůvodnění z hodnoty,
- vybraná varianta jedním klikem do e-mailu Nabídka,
- s každou další nabídkou **přesnější** návrhy.

Hotovo celé, když: návrh u nové nabídky Kryštof přijme bez úpravy nebo s úpravou do ±10 % aspoň
u dvou třetin nabídek za poslední 3 měsíce (měří N3).

## 2. Mantinely

- **Cena podle hodnoty pro klienta, ne podle hodin.** Systém hodiny nepočítá ani neukazuje.
  Rozsah slouží jen k popisu, co varianta obsahuje.
- **Navrhne, člověk potvrdí** (R-084, R-111). Nic neodejde klientovi samo, cena se nikde
  nezveřejní bez kliknutí.
- **Nic vymyšleného** (B10). Každé tvrzení o firmě má zdroj (URL a datum stažení). Odhad hodnoty
  je vždy označený jako odhad s předpoklady („typická zakázka v oboru 40–80 tisíc podle ceníků
  3 firem v okolí"); co nejde zjistit, je v návrhu jako „zjistit od klienta".
- **Stažený web je nedůvěryhodný vstup** (R-069). Agenti nemají nástroj, který by v ZakazIQ cokoli
  zapsal nebo odeslal; jejich jediný výstup je strukturovaný návrh, který ověří server (Zod).
- **Jen veřejné firemní údaje.** Stránky firmy, ARES, Mapy, katalogy firem, firemní profily na
  sítích, ceníky konkurence. Ne soukromé profily, rodina, osobní život. U OSVČ je i firemní rešerše
  osobní údaj (jméno, IČO), proto retence (oddíl 7).
- **Ceny ve Kč, neplátce DPH** (R-011, R-018).
- Bez nové npm závislosti, pokud to jde; `@anthropic-ai/sdk` už v repu je. Model jen přes
  `lib/ai/models.ts` (R-100), případně nová role.

## 3. Co už je a na co se napojí

| Kus | Kde | Použití |
|---|---|---|
| Hledání firem v Mapách | Growth OS `obchod/hledani-kontaktu` | Odkud firma přišla, hodnocení, obor, jestli má web |
| Rešerše před studeným e-mailem | `outreach_leads.research` (`angle`, `hook`, `findings[]`) | Výchozí podklad, nedělat dvakrát |
| Kontakt jako jediný zdroj údajů | `contacts`, `lib/admin/contact-sync.ts` (R-141) | Rozbor visí na kontaktu |
| Přepisy hovorů | `outreach_leads` (kontrakt v2), Hovory | Co klient chtěl a co ho trápí |
| Přepisy schůzek | migrace 134, R-144, R-145 | Totéž ze schůzek, které zůstaly uložené |
| Šablona Nabídka | `lib/admin/lead-mail-templates.ts`, `components/LeadEmailDialog.tsx` | Předvyplnit cenu a text |
| ARES | `lib/ares.ts` | IČO, sídlo, právní forma, jak dlouho firma existuje |
| Zakázky s cenou | `projects.price`, `service_type` | Historie pro podobné nabídky |
| Poptávky z webu klienta | `project_web_events` (KP17, R-130) | Co web klientovi skutečně přinesl (N4) |
| Ceník VIZEON | repo vizeon.cz `lib/data/pricing.ts` | Spodní hranice podle balíčku |

## 4. Jak to funguje

Spouštěč: tlačítko **„Připravit nabídku"** u kontaktu, u firmy od asistenta a v Hovorech (D-N1). Od N4 (R-158)
se rozbor spustí i sám: když firma od asistenta řekne ano a po poptávce z webu (oddíl 13).
Na pozadí běží:

1. **Rozbor webu**: stáhne web firmy (úvod a podstránky do limitu). Výstup: jestli web je, v jakém
   stavu (mobil, rychlost hrubě, formuláře, e-shop, základní SEO), co mu chybí, aby nosil poptávky.
2. **Rešerše firmy a trhu**: ARES (jak dlouho firma je, právní forma), Mapy (hodnocení, počet
   recenzí, kategorie), katalogy, firemní sítě, 2–3 konkurenti v okolí (jejich weby a ceníky,
   pokud je zveřejňují). Výstup: profil firmy a trhu se zdroji.
3. **Odhad hodnoty**: z 1 a 2 plus přepisu hovoru nebo schůzky. Kolik klient bere za typickou
   zakázku (z jeho ceníku, z ceníků konkurence, z hovoru), jak často poptávky chodí, jakou roli
   v tom web hraje, o co přichází dnes, jak velká a stabilní firma je. Výstup: rozmezí roční hodnoty
   s předpoklady a jistotou (nízká/střední/vysoká), „zjistit od klienta".
4. **Návrh ceny**: hodnota + cenová pravidla (oddíl 5) + ceník + podobné minulé nabídky →
   tři varianty (co obsahují, cena, zdůvodnění jednou až dvěma větami z hodnoty), doporučená
   varianta. Kontrola na konci: žádná varianta pod spodní hranicí balíčku ani mimo pravidla.

1 a 2 běží souběžně, 3 a 4 po nich. Výsledek je karta **„Rozbor a nabídka"** u kontaktu:
varianty, zdůvodnění, předpoklady odhadu hodnoty, zdroje, „zjistit od klienta" a tlačítko
„Použít v nabídce" (otevře e-mail Nabídka s předvyplněnou cenou a odstavcem o tom, co klient
dostane; text jde přepsat). Rozpad ceny po položkách ani hodiny se neukazují (D-N4).

### Kde to běží (D-N2, od 2026-11-26 R-149: Claude Code na předplatném)

Na Vercel Hobby má funkce časový strop a provoz se má později stěhovat na Cloudflare (R-135), proto
smyčka neběží v adminu. Původně Managed Agents od Anthropicu (placené API); **Kryštof 2026-11-26 rozhodl
jinak:** rozbor dělá **cloudová úloha Claude Code** na claude.ai/code v jeho předplatném. Tlačítko ji
spustí hned (API trigger), ráno v 7:00 ji spustí rozvrh jako zálohu. Vedoucí běží na Opusu, dva
subagenti (web firmy, rešerše) na Sonnetu; postup je skill `.claude/skills/zakaziq-rozbor-firmy/`.
Úloha si zadání vyzvedne a výsledek odevzdá přes `/api/public/rozbory` s klíčem z prostředí.
Bezpečnost `.claude/security/DECISIONS.md` #056.

### Cena běhu

API se neplatí. Rozbor se počítá do limitu předplatného Claude stejně jako práce v Claude Code.
Změřeno na 5 firmách 2026-11-28 (oddíl 11.1): **jeden rozbor = 2–2,7 minuty běhu** (93–137 s od vyzvednutí
po odevzdání), dva subagenti na Sonnetu dohromady **~540 tisíc tokenů** (každý ~270 tisíc, většinou čtení
cache), k tomu vedoucí na Opusu (počet tokenů log neukazuje). Kolik procent limitu to je, ukazuje jen
claude.ai/settings/usage; nezměřeno. Původní odhad pro Managed Agents byl $0,5–2 za běh.

## 5. Cenová pravidla (vyplní Kryštof v N0)

Agent bez nich umí jen opsat ceník. Pravidla žijí v `admin_settings` jako verzovaný dokument,
upravuje je Kryštof v adminu; agent smí navrhnout změnu, kterou Kryštof potvrdí.

| Pravidlo | Hodnota |
|---|---|
| Z čeho se hodnota určuje | Přínos webu za měsíc = zakázky z webu za měsíc × cena jedné typické zakázky → pásmo (tabulka níž, R-157, 2026-11-28: „počet zakázek hraje velkou roli"); bez počtu zakázek cena jedné zakázky. Uvnitř pásma rozsah a vlastní obrázek o firmě ze všeho veřejně dostupného (aktivity, recenze, další aspekty) |
| Pásma a varianty | Tabulka v oddílu 5.3 |
| Spodní hranice | 10 000 Kč za web; Micro (od 4 999) a Promo (od 9 999) jen když klient výslovně chce jednu stránku |
| Horní hranice | 50 000 Kč za web; výš jen e-shop nebo systém na míru, vždy s potvrzením Kryštofa předem |
| Návratnost | V nabídce jedna věta jako argument („web se vám zaplatí z jedné zakázky"), cenu neřídí |
| Smlouvání | Za stejný rozsah stejná cena. Jde-li cena dolů, jde dolů i rozsah (Základ, méně stránek) |
| Mimo cenu webu | Logo, grafika, design chatbotu a další služby jsou samostatné, naceňují se zvlášť z ceníku |
| Referenční cena | Zakázka za nižší cenu kvůli referenci se označí a navrhovač se z ní neučí |
| Neznámá hodnota zakázky klienta | Odhad z konkurence, nízká jistota, otázka do „zjistit od klienta" |
| Co je v ceně vždy | Všechno včetně textů a SEO optimalizace; fotky od klienta nebo z fotobanky |
| Úpravy do spuštění | Neomezeně do maximální spokojenosti v rámci schváleného rozsahu, do spuštění a 14 dní po něm; nová stránka nebo funkce mimo nabídku se nabízí zvlášť |
| Měsíční správa | 999 Kč měsíčně: web běží na hostingu VIZEONu, drobné úpravy průběžně, 2 články měsíčně po dohodě s klientem, aktualizace, bezpečnost, zálohy; nová stránka nebo funkce přes nabídku. V nabídce u všech variant, u Doporučené předvybraná, s větou „Bez správy je web od začátku váš, se správou se o něj starám já a kdykoli vám ho předám." |
| Zrušení správy | Převod webu na hosting klienta zdarma, výpověď s měsíční lhůtou |
| Focení na místě | Bez zvláštního příplatku. Většinou se nedělá; když ano, je součástí zakázky |
| Vlastnictví | Bez správy patří web klientovi od začátku. Se správou běží na hostingu VIZEONu; když klient správu zruší, web se přesune na jeho hosting, předá se kód a vše je jeho |
| Úpravy po spuštění bez správy | Individuální poplatek za práci (ne hodinová sazba) |
| Expres | Příplatek +50 % k ceně úpravy, jen když ji klient chce hotovou do 48 hodin |
| Zpětná vazba | Výběr varianty na stránce nabídky = „přijal" s variantou samo; zakázka z kontaktu s návrhem = „přijal" s výslednou cenou samo; 14 dní bez odpovědi = „neodpověděl" samo; Kryštof kliká jen „odmítl" a „smlouval" |
| Zdravá úspěšnost | 30–50 % přijatých nabídek; nad 60 % navrhovač navrhne zvednout ceny, pod 20 % hledá, kde to vázne |
| Technologie | Cenu neovlivňuje; doporučení Next.js pro weby, Shopify pro e-shopy, vlastní kód jen u neobvyklého napojení |
| Co odlišuje Základ, Doporučenou a Plus | Základ = prezentační web · Doporučená = navíc stránky služeb psané na poptávky, poptávkový formulář, lokální SEO · Plus = navíc systém (rezervace, e-shop, napojení na ZakazIQ) nebo správa. Texty a SEO jsou ve všech |
| Správa v nabídce | 999 Kč měsíčně jako volitelná položka v každé nabídce |
| Co navrhovač naceňuje (první verze) | Weby a e-shopy; ostatní služby pevně z ceníku |
| Tvar ceny | Celé tisíce (15 000, 45 000 Kč) |
| Varianta Plus | Rezervace, e-shop nebo správa; napojení na ZakazIQ až po spuštění Workspace (R-134) |
| E-shop | 30–80 tisíc podle počtu produktů, plateb a napojení; nad 50 tisíc vždy s potvrzením |
| Kdy cenu zvednout | Spěch u webu +25 % (rychleji než běžný termín); další jazyk +30 %; napojení na cizí systém podle náročnosti; víc než 10 podstránek |
| Firmy z Growth OS s ukázkou zdarma | Stejná pásma, ukázka cenu nesnižuje |
| Rešerše a posun v pásmu | Vše veřejné o firmě (web, recenze i jejich text, sítě, ARES a rejstřík, u s.r.o. účetní závěrky, inzeráty na práci, dotace, veřejné zakázky, média, insolvence jako varování); soukromí majitele ne. Výsledek: dolní / střední / horní třetina pásma s jednou větou proč |
| Co vidí klient | Jen co dostane, cenu a větu o návratnosti; obrázek o firmě je jen pro Kryštofa |
| Záloha | 30 % předem, 70 % po předání (podmínky vizeon.cz čl. 4, R-143) |

**14 dosavadních zakázek nejsou vzor ceny.** Byly to úvodní ceny kvůli prvním referencím (jednoduchý
web 10 000, vícestránkový 15 000 Kč). Navrhovač je smí brát jako vzor rozsahu a oboru, ne ceny
(Kryštof 2026-11-25).

### 5.1 Co víme od Kryštofa (rozhovor 2026-11-25)

Zapisuje se doslova podle smyslu, s datem. Z toho se plní tabulka výš.

- **Web má klientovi hodnotu vrátit hned.** Tvoří se tak, aby se investice klientovi rychle vrátila.
- **Rozmezí za web je teď 10 000–50 000 Kč.** Když klient chce víc, 40–50 tisíc je v pohodě.
- **Hodnota jedné zakázky klienta táhne cenu nahoru:** „máme za jednu zakázku 6 milionů" → 50 000 Kč,
  „to je jasný".
- **Prezentační web zhruba 10–20 tisíc, typicky 15 000 Kč.**
- Cena dál záleží na tom, **kolik má klient peněz, co od práce chce a na rozsahu**.
- Dřívější ceny (10 000 jednoduchý, 15 000 vícestránkový) byly kvůli referencím; dál to chce dělat jinak
  a je to pro něj hodně důležité.
- **Rešerše: „hledej o firmě úplně vše, co můžeš"** a z aktivit, recenzí a dalších aspektů si udělej
  vlastní obrázek. (Mantinel z oddílu 2 platí: o firmě všechno veřejné, soukromý život majitele ne.)
- **Smlouvání:** ubírá se rozsah, cena za stejnou práci zůstává. Když jde cena dolů, jde podle toho dolů
  i rozsah.
- **Logo, design chatbotu a podobné služby nesouvisejí s cenou webu**, jsou to samostatné služby.
- Q1–Q11 z prvního kola přijaté, Q5 a Q8 upravené jak výš (Kryštof: „u ostatních jinak ano").
- **Hosting a předání:** web se správou běží na hostingu VIZEONu; když klient správu zruší, web se
  přepíše na jeho hosting, předá se kód a vše je jeho.
- **Správa 999 Kč** = pravidelné úpravy, psaní článků, aktualizace, bezpečnost, zálohy.
- **Pozdější úpravy bez správy** (přidání fotek, změny) = individuální poplatek za práci. Příplatek se
  platí jen tehdy, když klient chce hotovo do 48 hodin.
- Q12–Q14 přijaté s úpravami výš; Q16–Q23 přijaté podle „u ostatních ano" (výklad agenta, Kryštof může
  opravit).
- **Správa: 2 články měsíčně po dohodě s klientem.** Expres +50 %. Focení na místě bez příplatku,
  většinou se nedělá, jinak je součástí zakázky. Q24–Q31 přijaté s těmito úpravami.
- **Prezentační web 10 000–30 000 Kč.** U prezentace nehraje rozsah takovou roli, cenu chce posunout
  výš (nahrazuje „prezentace 10–20 tisíc" výš). Rozložení podle pásem: návrh agenta v 6. kole.
- **ZakazIQ je zatím jen admin**, do varianty Plus napojení na ZakazIQ nepatří (Q33).
- Ceny na celé tisíce (Q34). Rozbor bez zakázky se drží 12 měsíců (Q35, uzavírá D-N5).
- **Nabídka v brandingu VIZEON jako HTML** (líbí se mu HTML šablona, stránka ve značce VIZEON); podobu
  doladí později (Q37).
- Q36: **souhlas se čtením odeslaných nabídek v Gmailu** (jen číst, do plánu jen anonymní čísla).
- Q38: tabulka pásem a variant v oddílu 5.3 přijata. Q39: **nabídka jako stránka ve značce VIZEON**
  s výběrem varianty, stavět v N2.

### 5.3 Pásma a varianty (přijato 2026-11-25, upraveno 2026-11-28)

Pásmo určuje **přínos webu za měsíc**: kolik zakázek měsíčně web klientovi přinese × cena jedné typické
zakázky (R-157). Když počet zakázek odhadnout nejde, pásmo se vybere podle ceny jedné zakázky (sloupec vlevo,
pásma z 25. 11.). Uvnitř rozmezí rozhoduje obrázek o firmě (dolní / střední / horní třetina). Ceny na celé
tisíce. Platí Základ < Doporučená < Plus.

| Přínos za měsíc | Bez počtu zakázek: jedna zakázka | Základ (prezentace) | Doporučená | Plus |
|---|---|---|---|---|
| pod 20 000 Kč | pod 10 000 Kč | 10 000 | 12 000–15 000 | 18 000–24 000 |
| 20 000–100 000 Kč | 10 000–100 000 Kč | 12 000–18 000 | 18 000–25 000 | 30 000–40 000 |
| 100 000–500 000 Kč | 100 000 Kč – 1 milion | 18 000–25 000 | 25 000–40 000 | 45 000–55 000 |
| nad 500 000 Kč | nad 1 milion | 25 000–30 000 | 40 000–50 000 | 55 000–70 000 |

Hranice přínosu (20 / 100 / 500 tisíc měsíčně) navrhl agent 2026-11-28 a Kryštof je vybral s příklady:
kavárna 100 hostů × 150 Kč = 15 000 → Doporučená 14 000; zámečník 10 zakázek × 4 000 = 40 000 → 22 000
(dřív 14 000); malíř 4 × 30 000 = 120 000 → 33 000 (dřív 22 000); stavební firma jedna zakázka za čtvrtletí
× 2 miliony → 45 000 (ceny pro střed pásma). Horní meze Plus doplnil agent 2026-11-27, Kryštof je potvrdil
2026-11-28. Nad 50 000 Kč jen s potvrzením Kryštofa.

E-shop mimo tabulku (potvrzeno 2026-11-28): Základ 30 000–40 000, Doporučená 40 000–50 000, Plus 50 000–80 000 Kč,
nad 50 000 s potvrzením. Příplatky (spěch, jazyk, napojení, víc než 10 podstránek) se přičítají k variantě.

### 5.4 Dosavadní nabídky z Gmailu (anonymně, zjištěno 2026-11-25)

Odeslaná pošta od 2026-01-01, jen čtení, se souhlasem Kryštofa. Nalezeno 7 nabídek (6 s cenou v textu).
Přílohy a faktury se neotevíraly a asi 147 e-mailů „Tvorba webových stránek" (portfolio bez ceny)
se neprošlo, takže nějaké ceny mohou chybět. Stejně jako zakázky v oddílu 5 jde o úvodní ceny,
**vzorem ceny nejsou**.

| Období | Obor | Co | Cena | Výsledek |
|---|---|---|---|---|
| 2026-04 | kavárna, 2× restaurace | jednostránkový web, studené oslovení | 5 000 | 3× bez odpovědi |
| 2026-07 | masáže | web, správa domény, 30/70 | 10 000 | nejasné |
| 2026-07 | zámečnictví | web | cena jen v příloze | domluveno |
| 2026-08 | malíř | web s databází a upozorněními e-mailem | 15 000 | domluveno za 15 000 |
| 2026-08 | spolek s restaurací | vícestránkový web, e-shop, Stripe, automatizace, správa 2 800 Kč/měs. | 45 000 po položkách | klient chtěl rozpis, pak bez odpovědi |

Co si z toho navrhovač bere: nízká cena (5 000) u studeného oslovení odpověď nepřinesla, takže
cena nebyla to, co rozhodovalo. Nabídka rozepsaná po položkách vedla k dotazu na rozpis a tichu,
což podporuje D-N4 (cena a zdůvodnění, bez rozpadu). Správa byla jednou nabídnutá za 2 800 Kč,
dnes platí 999 Kč.

### 5.2 Co dnes říká vizeon.cz (repo webu, zjištěno 2026-11-25)

- **Ceník** (`lib/data/pricing.ts`, aktualizace 2026-11-02): Micro Page od 4 999 (do 2 pracovních dnů),
  Promo Page od 9 999 (do 10 pracovních dnů), Pro Web od 14 999 (do 3 týdnů), E-shop na míru od 29 990
  (Shopify nebo vlastní kód). Design 299–699 Kč. Chatboty, rezervační systém, SEO „individuální".
  Automatizace (ALTENO) od 4 999. Přesměrování domény 1 499.
- **V ceně webu:** responzivní design, základní on-page SEO (Promo a Pro Web), „dohodnutý počet kol
  úprav", zaškolení, testování. **Není v ceně:** hosting a doména, copywriting a focení nad rámec
  podkladů, úpravy po spuštění. Texty, fotky a logo dodává klient (podmínky čl. 5).
- **Platby** (podmínky čl. 4): záloha 30 %, doplatek 70 % po předání, splatnost 14 dnů. Nabídka platí
  14 dní. Po zahájení prací je záloha nevratná.
- **Záruka:** 14 dní na technické chyby. Odpověď do 24 hodin.
- **Technologie:** e-shopy většinou Shopify, weby v portfoliu Next.js, React, Tailwind, hosting Vercel.
- **Cílovka:** živnostníci, malé firmy, řemeslníci. Argument ceny: „nejsme agentura, nemáme režii".

**Rozpory na webu a jak je Kryštof rozhodl (2026-11-25):**
1. Měsíčně: správa „od 480 Kč" × podmínky „Web u nás" 1 000 Kč × Growth OS 999 Kč →
   **platí 999 Kč měsíčně.**
2. Vlastnictví: podmínky čl. 6 (kód zůstává VIZEONu) × stránky „Web je váš" →
   **když klient nechce měsíční správu, web vlastní klient.** Se správou: otevřené (2. kolo).
3. Úpravy: „dohodnutý počet kol" × „opravím vše, dokud nejste 100% spokojeni" →
   **platí maximální spokojenost.**
4. Texty: copywriting podle webu není v ceně → **v ceně je všechno, i texty a SEO optimalizace.**
   Ceny na webu jsou „od", skutečná cena může být vyšší.
5. Micro a Promo pod spodní hranicí 10 000 Kč: otevřené (Q4).

Web vizeon.cz a jeho obchodní podmínky těmto odpovědím zatím neodpovídají (správa 480 Kč, kód
zůstává VIZEONu, copywriting mimo cenu). Úprava je práce v repozitáři vizeon.cz.

## 6. Učení ze zpětné vazby (N3, N4)

Ke každému návrhu se zapíše na jedno klepnutí (D-N3): kterou variantu Kryštof vzal, jakou cenu
skutečně poslal, odpověď klienta (přijal / odmítl / smlouval / neodpověděl) a výsledná cena
zakázky. Ze zápisů:

- **podobné nabídky** jako vzor pro další návrh (obor, velikost firmy, odhad hodnoty, cena),
- **měsíční vyhodnocení**: odchylka návrh vs. poslaná cena, úspěšnost podle cenového pásma a podílu
  z hodnoty, u kterých oborů odhad hodnoty nesedí,
- **návrh úpravy pravidel**, když se odchylka opakuje (Kryštof potvrdí).

N4 přidá skutečnou hodnotu: u zakázek s napojeným webem klienta (KP17) počet poptávek za prvních
6 a 12 měsíců proti odhadu. Hodiny se nesledují.

## 7. Data (návrh, migrace se jen připraví)

Číslo migrace se určí při psaní (po 135). Aditivní, idempotentní.

- `offer_research`: rozbor. Kontakt (`contact_id`), firma od asistenta (`outreach_lead_id`),
  web, stav (`queued`/`running`/`done`/`failed`), časy, model, `cost_usd`, `sources jsonb`,
  `web_analysis jsonb`, `company jsonb`, `value jsonb` (rozmezí, předpoklady, jistota), chyba.
- `offer_proposals`: návrh. Rozbor, kontakt, `variants jsonb` (název, co obsahuje, cena,
  zdůvodnění), doporučená, `missing_info`, verze pravidel; zpětná vazba: zvolená varianta, poslaná
  cena a čas, výsledek a čas, poznámka, zakázka (`project_id`), výsledná cena.
- `admin_settings.pricing_rules`: pravidla s verzí.
- Stránka nabídky (N2): `offer_proposals.public_token` (náhodný, jako `/p/[token]`), `opened_at`,
  `chosen_variant_at`. Veřejná cesta bez přihlášení, `noindex`, vynucená CSP, limit požadavků,
  obsah jen to, co vidí klient (oddíl 5, „Co vidí klient"). Bezpečnostní zápis v N2.

**Retence:** rozbor bez zakázky 12 měsíců od posledního pohybu (D-N5), se zakázkou podle R-076.
Smazání kontaktu bere rozbor s sebou (trigger, jako paměť v R-101). Úklid v cronu `client-retention`.

## 8. Rizika

| Riziko | Opatření |
|---|---|
| Vymyšlený údaj o firmě | Zdroj u každého tvrzení, server zahodí tvrzení bez zdroje |
| Odhad hodnoty vypadá jako fakt | Vždy rozmezí, předpoklady a jistota; nízká jistota = „zjistit od klienta" nahoře |
| Prompt injection ze staženého webu | Agenti nemají zapisovací nástroje, výstup jen přes schéma |
| Kotvení: Kryštof bere návrh bez přemýšlení | Předpoklady vždy viditelné; vyhodnocení v N3 |
| Cena mimo pravidla | Spodní a horní hranice, kontrola na konci kroku 4 |
| Náklady | Strop 15 rozborů za den, z toho nejvýš 10 automatických (R-158); kontakt sám nejvýš jednou za rok |
| Web firmy blokuje stahování | Rozbor pokračuje bez něj a řekne to; žádné obcházení |
| Data u Anthropicu (běhy úlohy na claude.ai) | Do úlohy jdou jen veřejné firemní údaje; běhy zůstávají v účtu Kryštofa, DECISIONS #056 |
| Rozbory ukrajují z limitu předplatného | Strop 15 za den (automaticky nejvýš 10), nejvýš 5 za běh; jeden rozbor ~2–2,7 min a ~540 tisíc tokenů subagentů (zkouška N1 na 5 firmách 2026-11-28) |
| Formulář na webu spustí rozbor cizí adresy | Jen za Turnstile a klíčem webu, úloha bez klíče k ZakazIQ, výstup přes `normalizeResult`, strop 10 automatických denně (DECISIONS #056 f) |

## 9. Kroky

| Krok | Co | Hotovo, když | Stav |
|---|---|---|---|
| **N0** | Cenová pravidla (oddíl 5); k 14 zakázkám obor, co dostal, proč ta cena | Tabulka v oddílu 5 bez `[DOPLNIT]`, vzory zapsané | hotovo 2026-11-25 (dosavadní zakázky a nabídky jsou úvodní ceny, ne vzor) |
| **N1** | Rozbor webu a rešerše jako karta u kontaktu, zatím bez ceny; migrace, běh v Claude Code na předplatném (R-149), retence, bezpečnost | Na 5 skutečných firmách rozbor se zdroji, změřený čas běhu a spotřeba limitu | na produkci od 2026-11-26 (`b1e5133`, migrace 137); zkouška na 5 firmách 2026-11-28 prošla (5× odevzdáno, oddíl 11.1), u 3 z 5 falešná „vada webu" z cloudu → opravený skill; zbývá karta na 390 a 1280 px |
| **N2** | Odhad hodnoty, tři varianty, stránka nabídky ve značce VIZEON (odkaz v e-mailu, klient vybere variantu tlačítkem „Beru tuhle variantu", Kryštof vidí otevření a výběr) | Na 5 minulých zakázkách návrh porovnaný se skutečnou cenou; stránka nabídky na telefonu i počítači | v kódu 2026-11-27 (migrace 142 na produkci); stránka ověřená na 390 a 1280 px s vymyšlenými daty; porovnání s minulými nabídkami v oddílu 12.1 (6 nabídek z Gmailu, ne zakázky z databáze); na produkci od 2026-11-27 (`afe75fc`), čeká první skutečná nabídka |
| **N3** | Výsledek nabídky na jedno klepnutí, měsíční vyhodnocení | První vyhodnocení po měsíci provozu | v kódu 2026-11-27; 2026-11-28 doplněné podobné nabídky u konceptu a úspěšnost podle podílu z hodnoty (oddíl 6); čeká první vyhodnocení po měsíci provozu |
| **N4** | Skutečná hodnota z poptávek přes web klienta (KP17), přepisy schůzek jako vstup, případně automatika | Podle nákladů z N1 a počtu napojených webů | porovnání s poptávkami z webu v kódu 2026-11-27; **2026-11-28 (R-158)** automatické spuštění (souhlas firmy, poptávka z webu) a návrhy vstupů ze schůzky ve Voice (oddíl 13); na produkci od 2026-11-28 (`159b8de`), naostro nevyzkoušené |

## 10. Rozhodnutí

| # | Otázka | Rozhodnuto (2026-11-25) |
|---|---|---|
| D-N1 | Spouštět ručně, nebo automaticky po souhlasu firmy? | ~~Ručně tlačítkem~~ → **i samo**: po souhlasu firmy od asistenta a po poptávce z webu; když není podle čeho hledat, upozornění (Kryštof 2026-11-28, R-158) |
| D-N2 | Managed Agents, nebo vlastní řízení přes Messages API? | ~~Managed Agents~~ → **cloudová úloha Claude Code na předplatném**, spuštění tlačítkem + ranní průchod, vedoucí Opus, subagenti Sonnet (Kryštof 2026-11-26, R-149) |
| D-N3 | Jakou zpětnou vazbu zapisovat? | **Výsledek nabídky a poslaná cena; hodiny ne**, cena se odvozuje z hodnoty pro klienta |
| D-N4 | Co návrh ukáže? | **Cena a zdůvodnění**, bez rozpadu po položkách a hodin |
| D-N5 | Retence rozboru bez zakázky | **12 měsíců od posledního pohybu**, se zakázkou podle R-076 |
| — | Síť agentů | **Neomezený přístup na web**, zapnuté jen hledání a čtení webů (Kryštof 2026-11-25) |

## 11. Jak je N1 postavené (2026-11-26)

Technika v `docs/admin/AGENTS-ADMIN.md` → „Navrhovač nabídek: rozbor firmy". Odchylky od plánu:

- **Rozbor je jen u kontaktu.** Firma od asistenta bez kontaktu (bez souhlasu) tlačítko nemá; firmy se
  souhlasem kontakt mají (R-141). Hovory přijdou s N2.
- **Běh přestavěný na Claude Code (R-149, 2026-11-26).** První verze N1 stála na Managed Agents (tlačítko
  „Nastavit agenty", strop 2 USD na běh); nasadila se, ale nikdy nespustila. Teď tlačítko zařadí rozbor
  do fronty a spustí cloudovou úlohu; úloha výsledek sama odevzdá, karta jen čte databázi. Migrace 137
  přidala stav `queued`, `claimed_at` a odkaz na běh.
- **Výsledek nesedí → úloha pošle opravu.** Vstup vrátí 422 a rozbor běží dál; po dvou pokusech úloha
  rozbor vzdá kódem `gave_up`.
- Vedoucí běží na Opusu (model úlohy), subagenti na Sonnetu (`model: "sonnet"` v nástroji Agent).

### 11.1 Zkouška na 5 firmách (2026-11-28)

Pět firem od asistenta (Kryštof je schválil 2026-11-26), každá zvlášť: řádek ve frontě se zadáním
složeným stejně jako `loadBriefForContact`, spuštění úlohy přes API trigger (bez tlačítka v adminu,
prohlížeč nebyl připojený). Přístup k síti prostředí je od 2026-11-28 **Full**; s „Limited" první pokus
2026-11-27 skončil `gave_up` (WebFetch hlásil ENOTFOUND na všechno kromě hledání).

| Firma | Běh / aktivně | Subagenti (tokeny) | Nabídka (Základ / Doporučená / Plus) | Co sedí | Co nesedí |
|---|---|---|---|---|---|
| Reality Dvořák (Třebíč) | 162 s / 137 s | 277k + 269k | 22 000 / 33 000 / 50 000 Kč, pásmo 2 | IČO, sídlo, dotace z Hlídače státu, provize v oboru | web z cloudu 503 (odsud 200) → „web nedostupný" i v textu pro klienta |
| Kovarson (Vsetín) | 140 s / 112 s | 273k + 269k | 24 000 / 38 000 / 53 000 Kč, pásmo 2 | poznal, že je to výrobce kotlů, ne instalatér (obor v databázi je špatně); ARES | „formulář vrací 404" (odsud 200); `kind` je web, i když má e-shop |
| Truhlářství Matoušek (Chotýšany) | 132 s / 110 s | 271k + 275k | 13 000 / 19 000 / 32 000 Kč, pásmo 1 | ceník, služby, IČO z webu i ARES, rok 2010 v patičce | — |
| Tesař Vostál (Kramolín) | 122 s / 93 s | 267k + 272k | 13 000 / 19 000 / 32 000 Kč, pásmo 1 předpokládané | IČO a sídlo z ARES, certifikát HTTPS opravdu nesedí | web jen přes `http://` (jede), nikdo to nezkusil → bez typické zakázky |
| ELSTAR (Všenory) | ~150 s / 119 s | 268k + 272k | 15 000 / 22 000 / 35 000 Kč, pásmo 1 | služby, stará recenze, prázdná galerie, © 2010 | „formulář bez pole pro zprávu" (pole tam je, shrnutí WebFetch ho vynechalo) |

Všech 5 se odevzdalo napoprvé (200), N2 hned připravilo koncept nabídky a do zvonku přišlo upozornění.
Žádný podvržený pokyn na webech. **Hlavní nález:** část českých webů vrací serverům v cloudu chybu (503, 404)
a WebFetch vrací jen shrnutí, ze kterého vypadávají části stránky. Rozbor to bral jako vady webu. Skill teď:
zkusit `www` i bez, pak `curl` GET (i `http://`), nepovedené načtení jen jako „ověřit v prohlížeči", nikdy
do textu pro klienta, a „něco chybí" jen podle HTML (DECISIONS #056 doplnění). Úloha si skill bere z GitHubu,
oprava platí od dalšího běhu po pushi na `main`. Vedoucí i subagent už předtím volali `curl` na ARES a web
firmy, i když to skill nedovoloval.

## 12. Jak jsou N2–N4 postavené (2026-11-27, R-155)

Technika v `docs/admin/AGENTS-ADMIN.md` → „Navrhovač nabídek: nabídka, stránka pro klienta a vyhodnocení".
Výklad agenta (Kryštof může změnit, všechno je v cenových pravidlech v adminu):

- **Cenu počítá server, ne model.** Model dodá pozici v pásmu (dolní / střední / horní třetina) a obsah variant,
  cena je střed třetiny rozmezí z tabulky 5.3, zaokrouhlená na tisíce.
- **Horní meze varianty Plus** tabulka nemá („od 18 000"): doplněno 18–24, 30–40, 45–55 a 55–70 tisíc
  (nad 50 000 vždy s potvrzením). **E-shop** rozložený na 30–40 / 40–50 / 50–80 tisíc. Obojí Kryštof potvrdil 2026-11-28.
- **Pásmo podle přínosu za měsíc** (2026-11-28, R-157): zakázky z webu za měsíc = střed odhadu poptávek × podíl
  zakázek z rozboru (jedno desetinné místo, 0,3 = jedna za čtvrt roku), × cena zakázky. Obojí jde v editoru přepsat
  z hovoru („Jedna zakázka klienta", „Zakázek z webu za měsíc"). Bez počtu zakázek platí pásmo podle ceny zakázky
  s poznámkou „počet zakázek chybí", bez obojího druhé pásmo s poznámkou „cena zakázky chybí".
- **Věta o návratnosti** jen do tří zakázek („zaplatí se z jedné / ze dvou / ze tří zakázek"), jinak se neukáže.
- **Zakázka z kontaktu s nabídkou** se k nabídce přiřadí, když vznikne do 120 dní od odeslání.
- **Návrhy úprav pravidel** nikdy cenu nesnižují: pod 20 % úspěšnosti jen postřeh, kde to vázne.
- **Podobné nabídky** (2026-11-28) jsou jen vzor vedle variant: dřívější nabídky jiným firmám se stejným oborem
  nebo pásmem, s poslanou cenou a výsledkem. Do výpočtu ceny nevstupují, učení jde dál přes návrhy úprav pravidel.
- **Podíl z hodnoty** (2026-11-28): cena doporučené varianty proti středu odhadu ročního přínosu, skupiny pod 10 %,
  10–25 %, 25–50 % a 50 % a víc. Hranice zvolil agent.
- **Přepisy schůzek** do rozboru nejdou (DECISIONS #056): úloze jdou jen veřejné údaje o firmě. Od N4 (R-158)
  je u konceptu blok „Ze schůzky" (oddíl 13), návrh z přepisu se do editoru dostane kliknutím.

### 12.1 Pravidla proti dosavadním nabídkám (2026-11-27)

Kritérium N2 „na 5 minulých zakázkách návrh porovnaný se skutečnou cenou". Zakázky z produkční databáze
agent číst nesměl (automatický režim čtení zamítl), porovnání je proto na šesti nabídkách s cenou z oddílu 5.4.
**Cena jedné zakázky klienta je odhad agenta z oboru** (rozbor firmy ji zatím u žádné nemá), pozice v pásmu
vždy střed, bez příplatků. Výpočet `priceVariants` s výchozími pravidly.

| Nabídka | Poslaná cena | Odhad zakázky klienta → pásmo | Základ / Doporučená / Plus | Odpovídá | Rozdíl |
|---|---|---|---|---|---|
| kavárna, jednostránkový web | 5 000 | 200–2 000 → pod 10 000 | 10 000 / 14 000 / 21 000 | Základ 10 000 | +100 % |
| restaurace A, jednostránkový web | 5 000 | 300–5 000 → pod 10 000 | 10 000 / 14 000 / 21 000 | Základ 10 000 | +100 % |
| restaurace B, jednostránkový web | 5 000 | 300–5 000 → pod 10 000 | 10 000 / 14 000 / 21 000 | Základ 10 000 | +100 % |
| masáže, web | 10 000 | 800–2 000 → pod 10 000 | 10 000 / 14 000 / 21 000 | Základ 10 000 | 0 % |
| malíř, web s databází a upozorněními | 15 000 | 15 000–60 000 → 10–100 tisíc | 15 000 / 22 000 / 35 000 | Plus 35 000 | +133 % |
| spolek s restaurací, web + e-shop + automatizace | 45 000 | e-shop | 35 000 / 45 000 / 65 000 | Plus 65 000 (potvrdit) | +44 % |

Co z toho plyne:
- Jednostránkové weby za 5 000 Kč pravidla nedovolí (spodní hranice 10 000 Kč, Micro a Promo jen na výslovné přání).
  Studené oslovení za 5 000 stejně nepřineslo odpověď, takže cena nebyla to, co rozhodovalo.
- U malíře je rozdíl největší: web s databází je podle pravidel Plus (systém navíc). Kdyby ho Kryštof poslal
  jako Doporučenou, vyšlo by 22 000 Kč (+47 %).
- E-shop spolku za 45 000 Kč sedí přesně na Doporučenou e-shopu; Plus nad 50 000 Kč chce potvrzení.
- Věta o návratnosti se ukázala jen u malíře („ze tří zakázek"); u kavárny, restaurací a masáží by web
  zaplatily až desítky zakázek, takže se věta neukáže, jak má.
- Spolehlivé porovnání přijde s N3: z poslaných nabídek a odpovědí klientů, ne z úvodních cen.

## 13. N4: samo spuštěný rozbor a vstupy ze schůzky (2026-11-28, R-158)

Kryštof 2026-11-28: rozbor ať se spustí sám, „když firma řekne ano i nová poptávka z webu; když nebude možné nic
najít, vykašli se na to a dej mi oznámení v ZakazIQ". Ze schůzky ať AI navrhne vstupy nabídky. Technika
v `docs/admin/AGENTS-ADMIN.md` → „Navrhovač nabídek: samo spuštěný rozbor a vstupy ze schůzky (N4)".
Výklad agenta (Kryštof může změnit):

- **Firma od asistenta**: rozbor se spustí, jen když ano řekla v právě přijatém snímku z Growth OS. Firmy, které
  souhlasily dřív, se samy nespustí.
- **Poptávka z webu** (kontaktní formulář i objednávka z vizeon.cz, alteno.cz, prvotka.cz): hledá se podle webu
  z formuláře, jinak podle e-mailu na vlastní doméně. Bez obojího se nic nezakládá a rozbor se nespustí; řekne to
  věta v upozornění o poptávce (jeden zvonek, ne dva). S webem se najde nebo založí kontakt a poptávka se na něj
  napojí; úloha jako firmu dostane doménu webu, ne jméno člověka.
- **Strop** 10 automatických rozborů za 24 h uvnitř celkových 15, ať na tlačítko zbude místo. Kontakt dostane
  automatický rozbor nejvýš jednou za rok (i přes sloučení kontaktů).
- **Upozornění**: rozbor se nespustil (chybí web i IČO, strop), rozbor se nepovedl (úloha o firmě nic spolehlivého
  nenašla, nebo nedoběhl). Úloha se má vzdát, když o firmě nic spolehlivého není (skill `zakaziq-rozbor-firmy`).
- **Ze schůzky**: u konceptu nabídky poslední hotová schůzka ze ZakazIQ Voice přiřazená ke kontaktu (shrnutí
  a dohody, když už jsou). „Načíst ze schůzky" pošle přepis modelu `smart` (bez nástrojů, ze serveru) a vrátí
  cenu jedné zakázky klienta, web / e-shop, jazyky navíc, spěch a rozpočet klienta, každý s citací. Návrh projde,
  jen když citace v přepisu opravdu je a částka v ní zazněla; „Použít" ho dá do editoru, rozpočet je jen pro
  informaci. Cena volání se přičte ke schůzce (Voice › Přehled › náklady). Bez schůzky se blok neukáže.

