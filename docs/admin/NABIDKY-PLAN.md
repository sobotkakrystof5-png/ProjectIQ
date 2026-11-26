# Navrhovač nabídek — plán

> Systém, který k firmě nebo kontaktu na pozadí stáhne a rozebere web, udělá rešerši z veřejných
> zdrojů, odhadne, **jakou hodnotu web klientovi přinese**, a z ní navrhne cenu nabídky ve třech
> variantách. Navrhuje, nerozhoduje: cenu potvrdí a pošle Kryštof. Učí se ze zpětné vazby (jakou
> cenu Kryštof poslal, co klient odpověděl, co web klientovi pak skutečně přinesl), ne dotrénováním
> modelu. Rozhodnutí **R-147**.
>
> Stav: **N0 hotové** (2026-11-25, pravidla v oddílu 5). **N1 v kódu** (2026-11-26, migrace 136),
> neaplikované a nevyzkoušené na skutečných firmách.

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

Spouštěč: tlačítko **„Připravit nabídku"** u kontaktu, u firmy od asistenta a v Hovorech (D-N1).
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

### Kde to běží (D-N2: Managed Agents)

Na Vercel Hobby má funkce časový strop a provoz se má později stěhovat na Cloudflare (R-135).
Proto **Managed Agents od Anthropicu**: smyčku i stahování webu hostuje Anthropic, admin jen
založí běh a převezme výsledek (webhook nebo dotaz na stav, ověřit v N1). Je v betě a historie
běhů zůstává u Anthropicu, dokud ji nesmažeme: po převzetí výsledku ji mažeme. Bezpečnostní
zápis do `.claude/security/DECISIONS.md` v N1.

### Cena běhu (ceník Anthropicu, ověřeno 2026-11-25)

Sonnet 5.5 $2 / $10 za milion tokenů (vstup / výstup), Haiku 5.5 $0,10 / $0,50, Opus 5.5 $4 / $20,
hledání na webu $10 za 1 000 dotazů, běh Managed Agents $0,08 za hodinu. Odhad jednoho běhu
(sběr na Haiku/Sonnetu, odhad hodnoty a cena na Opusu): **$0,5–1, asi 10–25 Kč**. Skutečnou cenu
každého běhu ukládáme (`cost_usd`) a N1 ji změří.

## 5. Cenová pravidla (vyplní Kryštof v N0)

Agent bez nich umí jen opsat ceník. Pravidla žijí v `admin_settings` jako verzovaný dokument,
upravuje je Kryštof v adminu; agent smí navrhnout změnu, kterou Kryštof potvrdí.

| Pravidlo | Hodnota |
|---|---|
| Z čeho se hodnota určuje | Hodnota jedné typické zakázky klienta → pásmo (tabulka níž); uvnitř pásma rozsah a vlastní obrázek o firmě ze všeho veřejně dostupného (aktivity, recenze, další aspekty) |
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

### 5.3 Pásma a varianty (přijato 2026-11-25)

Pásmo určuje hodnota jedné typické zakázky klienta. Uvnitř rozmezí rozhoduje obrázek o firmě
(dolní / střední / horní třetina). Ceny na celé tisíce. Platí Základ < Doporučená < Plus.

| Jedna zakázka klienta | Základ (prezentace) | Doporučená | Plus |
|---|---|---|---|
| pod 10 000 Kč | 10 000 | 12 000–15 000 | od 18 000 |
| 10 000–100 000 Kč | 12 000–18 000 | 18 000–25 000 | od 30 000 |
| 100 000 Kč – 1 milion | 18 000–25 000 | 25 000–40 000 | od 45 000 |
| nad 1 milion | 25 000–30 000 | 40 000–50 000 | nad 50 000 jen s potvrzením Kryštofa |

E-shop mimo tabulku: 30 000–80 000 Kč, nad 50 000 s potvrzením. Příplatky (spěch, jazyk, napojení,
víc než 10 podstránek) se přičítají k variantě.

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
| Náklady | Spouští se ručně (D-N1); strop počtu běhů za den |
| Web firmy blokuje stahování | Rozbor pokračuje bez něj a řekne to; žádné obcházení |
| Data u Anthropicu (Managed Agents) | Mazání běhů po převzetí výsledku, zápis do DECISIONS v N1 |

## 9. Kroky

| Krok | Co | Hotovo, když | Stav |
|---|---|---|---|
| **N0** | Cenová pravidla (oddíl 5); k 14 zakázkám obor, co dostal, proč ta cena | Tabulka v oddílu 5 bez `[DOPLNIT]`, vzory zapsané | hotovo 2026-11-25 (dosavadní zakázky a nabídky jsou úvodní ceny, ne vzor) |
| **N1** | Rozbor webu a rešerše jako karta u kontaktu, zatím bez ceny; migrace, běh přes Managed Agents, retence, bezpečnost | Na 5 skutečných firmách rozbor se zdroji, změřená cena a čas běhu | v kódu 2026-11-26; čeká migrace 136, nastavení agentů a zkouška na 5 firmách se souhlasem Kryštofa |
| **N2** | Odhad hodnoty, tři varianty, stránka nabídky ve značce VIZEON (odkaz v e-mailu, klient vybere variantu tlačítkem „Beru tuhle variantu", Kryštof vidí otevření a výběr) | Na 5 minulých zakázkách návrh porovnaný se skutečnou cenou; stránka nabídky na telefonu i počítači | čeká |
| **N3** | Výsledek nabídky na jedno klepnutí, měsíční vyhodnocení | První vyhodnocení po měsíci provozu | čeká |
| **N4** | Skutečná hodnota z poptávek přes web klienta (KP17), přepisy schůzek jako vstup, případně automatika | Podle nákladů z N1 a počtu napojených webů | čeká |

## 10. Rozhodnutí

| # | Otázka | Rozhodnuto (2026-11-25) |
|---|---|---|
| D-N1 | Spouštět ručně, nebo automaticky po souhlasu firmy? | **Ručně tlačítkem** |
| D-N2 | Managed Agents, nebo vlastní řízení přes Messages API? | **Managed Agents** |
| D-N3 | Jakou zpětnou vazbu zapisovat? | **Výsledek nabídky a poslaná cena; hodiny ne**, cena se odvozuje z hodnoty pro klienta |
| D-N4 | Co návrh ukáže? | **Cena a zdůvodnění**, bez rozpadu po položkách a hodin |
| D-N5 | Retence rozboru bez zakázky | **12 měsíců od posledního pohybu**, se zakázkou podle R-076 |
| — | Síť agentů | **Neomezený přístup na web**, zapnuté jen hledání a čtení webů (Kryštof 2026-11-25) |

## 11. Jak je N1 postavené (2026-11-26)

Technika v `docs/admin/AGENTS-ADMIN.md` → „Navrhovač nabídek: rozbor firmy". Odchylky od plánu:

- **Rozbor je jen u kontaktu.** Firma od asistenta bez kontaktu (bez souhlasu) tlačítko nemá; firmy se
  souhlasem kontakt mají (R-141). Hovory přijdou s N2.
- **Tým ve starším tvaru `coordinator`, bez dynamických workflow.** Knihovna `@anthropic-ai/sdk` 0.105
  novější tvar nezná; nová hlavní verze knihovny by byla samostatný krok (R-053). Jeden běh je tak levnější
  a předvídatelnější.
- **Výsledek si admin vyzvedává sám** (karta každých 8 s, záložně denní cron), bez webhooku Anthropicu,
  který by se musel registrovat v Console.
- Vedoucí běží na `claude-opus-5-5` (nová role `deep`), web čte `claude-haiku-5-5`, rešerši `claude-sonnet-5-5`.
