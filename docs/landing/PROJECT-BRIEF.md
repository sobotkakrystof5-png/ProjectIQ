# PROJECT BRIEF — landing page ZakazIQ

> Zadání pro sezení **S04** (stavba a animace) a **S05** (SEO, metadata, finální texty). Vzniklo v S03 skillem `web-project-brief` (2026-10-08).
> Platí spolu s `AGENTS.md` (hranice v repu, B8 Dílky, B10 texty, B13 bezpečnost), skilly `zakaziq-design-dilky` a `zakaziq-ux-texty-cs` a rozhodnutími v `memory/memory.md` (R-016 až R-033). Při rozporu platí Rozhodnutí.
> Vizuální vzor: mockup **LP-D · Podle loga ZakazIQ**, artboard `LandingD` na plátně [ZakazIQ Workspace – mockupy](https://claude.ai/artifact/R5WSezYUPY6Tt9weQgBNez). Kde brief a mockup nesouhlasí, platí brief. Odchylky jsou vyjmenované v § 4.10.
> Šablona `CLAUDE.md` ze skillu se nevytváří. Stav projektu se vede v `memory/memory.md`.

---

## 0. Kritické: nesmí to vypadat jako „AI šablona“

Tohle je nejdůležitější část zadání a platí pro každé rozhodnutí níže. Většina webů od AI vypadá stejně a člověk je pozná na první pohled. Landing ZakazIQ má působit jako práce designéra, který zná malé firmy a ví, jak vypadá diář kadeřnice v pátek odpoledne.

**Čemu se vyhnout (konkrétně tady):**

- **Modrobílá SaaS šablona.** Bílé pozadí, modré tlačítko, šedý text a ilustrace vpravo. Dílky jsou námořnická modrá s jedinou teplou barvou, a ta patří jen nové poptávce a odměně (`signal`). Nikde jinde, ani jako dekorace.
- **Ikonové trojice.** Tři karty s ikonou nahoře, nadpisem a dvěma řádky textu. Sekce „Co to umí“ má sice tři karty, ale každá nese **vlastní animovanou ilustraci z aplikace** (poptávka, věrnostní karta, graf příjmů), žádnou ikonu. Moduly jsou dlaždice v odstínech modré, ne mřížka ikon.
- **Hero „nadpis uprostřed, dvě tlačítka, obrázek vpravo“.** Hero je tmavé pole dílků. Nadpis má serifovou kurzívu v druhé půlce a živá ukázka aplikace přetéká přes spodní hranu tmavé plochy do další sekce. Hlavní tlačítko je jen jedno, vedlejší akce je tichý textový odkaz.
- **Gradienty, glassmorphism, 3D ilustrace, stock fotky.** Povolené jsou jen gradient loga a věrnostní karty (`navy-600 → navy-800`) a jedno jemné radiální světlo v hero. Fotky žádné, místo nich ukázky skutečných obrazovek.
- **„Fade-in + slide-up“ na všem.** Nájezd sekcí smí být jen jeden (`zq-rise`, jednou). Ostatní pohyb vysvětluje produkt: poptávka přijede, zařadí se do kalendáře, razítko vyskočí. Co nic nevysvětluje, se nehýbe.
- **Obecné marketingové fráze.** Žádné „revoluční“, „all-in-one“, „posuňte svůj byznys“, „jsme tým profesionálů“. Píše zakladatel v první osobě a jen to, co produkt skutečně umí.
- **Stejný rytmus všech sekcí.** Sekce se liší kompozicí i hustotou: světlé karty, tmavý panel s kroky, barevná mozaika modulů, terminálová karta, tmavý ceník s polem dílků, úzký sloupec dotazů.
- **Výchozí písmo bez charakteru.** Instrument Sans 600 s těsným prokladem (`-0.02em` až `-0.035em`), serifová kurzíva jen na druhé půlce nadpisu a čísla, časy a částky v JetBrains Mono. Inter se tu nepoužívá.

**Místo toho:**

- **Podpisový motiv: dílky 2×2 z loga jako skládání byznysu „po dílcích“.** Logo je čtverec se čtyřmi dílky a stejný princip nese celá stránka:
  - **pole pulzujících dílků** v tmavých plochách (hero, panel Jak to funguje, ceník): mřížka čtverců 44 px, ~9 % z nich pulzuje v `navy-500`, čisté CSS, deterministicky;
  - **v sekci Proč to řešit** se rozházené kousky (SMS, zpráva z Instagramu, e-mail, stránka diáře) při scrollu jednou složí do mřížky dílků, tedy do jednoho přehledu;
  - **moduly** jsou dílky různých odstínů modré, které si člověk „skládá“;
  - **razítka** na věrnostní kartě jsou bílé dílky se zaoblením;
  - **znak 2×2** (5 px) slouží jako odrážka v pásu oborů a u štítků.
  Motiv je podpis, ne tapeta. Každá sekce ho použije nejvýš jednou.
- **Živá ukázka aplikace místo screenshotu.** Poptávky přijíždějí, blok se zařadí do týdne, karta dostane razítko. Návštěvník pochopí produkt dřív, než dočte perex.
- **Mikrointerakce podle obsahu.** Hover na dlaždici modulu ukáže jeho popis, hover na kroku zastaví automatický cyklus a ukáže ten krok. Žádné obecné `scale-105`.
- Před dokončením každé sekce si polož otázku: *je tohle navržené pro ZakazIQ, nebo by to fungovalo na jakémkoli SaaS?* Když to druhé, předělat. Když si nejsi jistý, zeptej se.

---

## 1. Kontext a obsah

| | |
|---|---|
| **Produkt** | ZakazIQ Workspace, přehled podnikání pro malé firmy, které dostávají poptávky |
| **Provozovatel** | Kryštof Sobotka (VIZEON, ALTENO), OSVČ, neplátce DPH |
| **IČO** | `[DOPLNIT]` |
| **Doména** | `zakaziq.cz` (R-030), landing na `/`, aplikace na `/w` (R-017) |
| **E-mail podpory** | `[DOPLNIT]` (firemní adresa se teprve řeší, R-032) |
| **Telefon, adresa** | na landing page nejsou |

**Co produkt umí** (zdroj: `docs/workspace/PLAN.md`, nic navíc): poptávka z webu se sama objeví v kalendáři jako čárkovaný blok a potvrdí se jedním klikem. Zákazník dostane e-mail a po návštěvě razítko na věrnostní kartu. Dál zákazníci se skupinami (Noví, Stálí, Jednorázoví, Spící, Ukončení) a panelem „Komu napsat“, zakázky s vlastními stavy a kolonkami, faktury, příjmy a výdaje, odhad daní a měsíční přehled e-mailem. Šablony podle oboru. Napojení webu třemi cestami.

**Cena:** 249 Kč měsíčně, konečná cena bez DPH navíc (R-018). Prvních 14 dní zdarma, karta se zadává při registraci (R-038, nahradilo R-019). V ceně 1 byznys a neomezeně pracovníků, všechny funkce (R-026).

**Obory** (pás oborů, šablony): Kadeřnictví, Kosmetika, Zámečnictví, Studnařství, Likvidace azbestu, Autoservis, Úklid, Stavba a řemesla.

**Cíl stránky:** registrace (`/w/registrace`). Jedna hlavní akce na celé stránce: „Začít za 249 Kč měsíčně“. Vedlejší cesta je e-mail na podporu, pro lidi, kteří se chtějí nejdřív zeptat.

**Tón:** přímý, v první osobě zakladatele („Web vám postavím a rovnou napojím.“), bez superlativů, oslovení „vy“. Čtenář je kadeřnice nebo zámečník s telefonem v ruce, žádný IT člověk. Pravidla a slovník: skill `zakaziq-ux-texty-cs` (v textech „funkce“, ne „modul“; „skupina“, ne „segment“; „účet“, ne „workspace“). Žádné technické termíny mimo sekci Napojení, kde smí padnout „kód“.

**Co nemáme a nevymýšlíme:** počty klientů, recenze, citace, loga zákazníků, procenta úspor, reference. Sekce „Kdo za tím stojí“ se nedělá (R-023). Pilotní klient zatím není, takže sociální důkaz na stránce nebude. Až bude, přidá se jako samostatný krok.

---

## 2. Logo a design systém

Závazný je design systém **Dílky** (R-021, `AGENTS.md` → B8). Všechno už je v kódu z S01, nic se nevymýšlí znovu:

| Co | Kde |
|---|---|
| Tokeny (světlý i tmavý) | `app/ws-tokens.css`, platí uvnitř `[data-app="ws"]` |
| Tailwind (`navy-*`, `ground`, `surface`, `ink`, `quiet`, `signal*`, `reward`, `font-accent`, `font-num`, `rounded-tiny…hero`, `animate-zq-*`) | `lib/ws/tailwind-dilky.ts` |
| Písma | `lib/ws/fonts.ts` (`next/font`, self-hosted, žádný Google Fonts request) |
| Kořen stránky | `app/(marketing)/layout.tsx` → `WsRoot` |
| Logo, pole dílků, znak 2×2, nadpis s kurzívou, číslo sekce, věrnostní karta, blok nové poptávky, potvrzený blok, živá tečka, částky, časy | `components/ws/brand/` (`Logo`, `TileField`, `TileGlyph`, `AccentHeading`, `SectionLabel`, `LoyaltyCard`, `NewRequestBlock`, `ConfirmedBlock`, `LiveDot`, `Money`, `TimeRange`) |
| Tlačítka, akordeon/dialog primitiva | `components/ui/` |
| Pohyb | `lib/ws/motion.ts`, `.claude/skills/zakaziq-design-dilky/references/motion.md` |

**Logo:** komponenta `Logo` (čtverec `navy-600 → navy-800`, mřížka 2×2 bílých dílků, v hlavičce dva dílky jemně dýchají). Žádný soubor loga se nezpracovává.

**Barvy:** jen tokeny, žádné hexy ani `blue-500`. Poměr: světlé sekce na `ground` s kartami `surface`, tmavé plochy `navy-950` (hero, Jak to funguje, ceník, footer). `signal` výhradně pro „právě dorazilo“, blok nové poptávky a připravenou odměnu (`reward`).

**Typografie:** H1 88 px / mobil 40 px, H2 56/28, H3 26/20, tělo 17/15, drobné 13/12. Druhá půlka každého H1/H2 v `font-accent` kurzívou (`navy-500` na světlém, `navy-300` na tmavém), v jednom nadpisu nejvýš jednou. Čísla sekcí jako štítek v mono verzálkách: `01 — CO TO UMÍ`.

**Tvary:** tlačítka a navigace jako pilulky, výška min. 44 px. Karty 20–24 px, velké panely 32 px, hero a footer 40 px. Okraje 1 px `navy-100`, stín jen u věrnostní karty v hero.

**Rozestupy:** sekce 120 px od sebe (mobil 72 px), obsah max. 1200 px. Tmavé panely (Jak to funguje, ceník) jsou zaoblené bloky s vlastním okrajem, ne pruhy přes celou šířku. I tím se rytmus mění.

**Tmavý režim:** landing ho nepotřebuje přepínat. Respektuje `prefers-color-scheme` jen tehdy, když to `WsRoot` dělá sám. Ověřit čitelnost, nic navíc nestavět.

---

## 3. Technické řešení

**Stack:** stejné repo a větev `workspace`. Next.js 14 App Router, TypeScript strict, Tailwind + tokeny Dílky, Framer Motion na stavové animace, CSS keyframes na smyčky. Žádná nová závislost (když by byla potřeba, zápis do Rozhodnutí podle `AGENTS.md` → B2).

**Struktura: jedna stránka se scrollem a kotvami** v `app/(marketing)/page.tsx`. Vícestránkový web to není.

- Kotvy v hlavičce: `#funkce` (01 Co to umí), `#jak-to-funguje`, `#napojeni`, `#cenik`. Další kotvy bez položky v menu: `#proc`, `#funkce-seznam` (moduly), `#dotazy`.
- Plynulý scroll (`scroll-behavior: smooth`, vypnutý při `prefers-reduced-motion`), `scroll-margin-top` podle výšky hlavičky. Aktivní položka v menu podle sekce ve viewportu (`IntersectionObserver`).
- **Ceník je kotva `#cenik`**, ne samostatná stránka. Jestli `/cenik` dává smysl kvůli vyhledávání, rozhodne S05 podle klíčových slov.
- Samostatné stránky: `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva` ve stejném layoutu (hlavička + footer), text `[DOPLNIT]` (R-023). Jak je indexovat, než budou texty, řeší S05.

**Vykreslování a bezpečnost (R-033):**

- `app/(marketing)/layout.tsx` dostane `export const dynamic = 'force-dynamic'`, aby stránky dostaly nonce. CSP na `/` a právních stránkách je **vynucená** profilem `workspace`.
- V `lib/security/csp.ts` se landing přidá jako **přesné cesty** (`/`, `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva`), ne jako prefix `/`. `hasPrefix('/')` by chytil celý web včetně adminu. Zápis do `.claude/security/CSP-LOG.md` a `STATE.md` ve stejném commitu.
- Žádný skript třetí strany, žádná analytika, žádné cookies kromě nezbytných, takže ani cookie lišta. Kdyby se analytika chtěla, je to samostatné rozhodnutí (B13).
- Žádné API klíče ani `NEXT_PUBLIC_` secrets. Stránka nic nenačítá z DB.
- Odkazy ven `target="_blank"` s `rel="noopener noreferrer"`.

**Kolize s adminem na `/`:** `app/page.tsx` (admin) dnes přesměrovává na `/hub` nebo `/login` a s `app/(marketing)/page.tsx` se na stejné cestě nesnese (build spadne). Prompt S04 jeho smazání výslovně povoluje jako jedinou změnu mimo nové složky. Admin vstupuje přes `/login` (odkaz Admin ve footeru). Přihlášený admin uvidí v hlavičce odkaz „Do administrace“ (malá klientská komponenta, která se ptá `/api/auth/session`, takže landing neimportuje NextAuth na serveru). Rozhodnutí zapíše S04.

**Responzivita:** mobile-first. Šířky k ověření 390, 768, 1280, 1440 px.

**SEO:** jen zadání, provedení v S05 (§ 11).

---

## 4. Obsah stránky po sekcích

Pořadí: LP-D + sekce Proč to řešit (R-031). Čísla sekcí jsou proto posunutá oproti mockupu.

```
Hlavička (v hero)
Hero „Každá poptávka na svém místě.“ + pole dílků + živá ukázka
Pás oborů
01 Proč to řešit            (nové oproti LP-D)
02 Co to umí                (#funkce)
03 Jak to funguje           (#jak-to-funguje)
04 Funkce: Skládejte si to po dílcích
05 Napojení na váš web      (#napojeni)
06 Ceník                    (#cenik)
07 Dotazy                   (#dotazy)
Footer s výzvou a odkazem Admin
```

Texty níže jsou návrh (prošly `zakaziq-ux-texty-cs` a `humanize-text-cs`). S05 je doladí kvůli vyhledávání, fakta se měnit nesmí.

### 4.0 Hlavička

- Uvnitř tmavého hero, není to samostatný bílý pruh. Vlevo `Logo` + „ZakazIQ“. Uprostřed pilulková navigace (průhledná pilulka s okrajem `navy-200/15`): **Funkce · Jak to funguje · Napojení webu · Ceník**. Vpravo „Přihlásit“ (tichý odkaz) a „Začít za 249 Kč“ (bílá pilulka, `navy-950` text).
- Po odjetí z hero se hlavička přichytí nahoře jako kompaktní tmavá pilulka. Bez rozmazaného skla, plné `navy-950/95`.
- Mobil: logo + „Začít“ + tlačítko menu (`aria-label="Otevřít menu"`), menu jako panel shora se stejnými kotvami a odkazem Přihlásit.
- Odkazy: „Přihlásit“ → `/w/prihlaseni`, „Začít za 249 Kč“ → `/w/registrace`. Přesné cesty Clerku potvrdí S07. Do té doby vedou na 404 a to je v pořádku.

### 4.1 Hero

**Kompozice:** tmavá plocha `navy-950` se spodními rohy 40 px, v pozadí `TileField` (pole dílků) a jedno jemné radiální světlo. Text vlevo, zarovnaný doleva, ne na střed. Živá ukázka je široký panel pod textem (nebo vpravo od něj od 1280 px, podle LP-D) a **spodní třetinou přetéká přes hranu tmavé plochy** na `ground`. Věrnostní karta plave přes pravý horní roh ukázky se stínem a jemným `zqFloat`.

**Texty:**

- Štítek se živou tečkou (`LiveDot`, `signal`): „Právě dorazila poptávka: **{jméno z ukázky}**“, mění se s cyklem ukázky.
- **H1:** „Každá poptávka *na svém místě.*“
- **Perex:** „Poptávka z vašeho webu se sama zařadí do kalendáře. Potvrdíte ji jedním klikem a o e-mail, připomínku i razítko na věrnostní kartu se postará ZakazIQ.“
- **Hlavní tlačítko:** „Začít za 249 Kč měsíčně“ → `/w/registrace` (bílá pilulka).
- **Vedlejší odkaz:** „Napište nám“ → `mailto:[DOPLNIT e-mail podpory]` (textový odkaz `navy-200` s podtržením při hoveru, žádné druhé tlačítko).
- **Drobný řádek** (mono, `navy-300`): „14 dní zdarma · vše v ceně · zrušíte kdykoli · přihlášení bez hesla“

**Živá ukázka** (`aria-label="Ukázka aplikace"`, malý štítek „ukázka“ v rohu, aby nikdo nečetl jména jako skutečné zákazníky):

- Levý sloupec „Příchozí · živě“: tři poslední poptávky. Nejnovější je `NewRequestBlock` (`signal-bg`, čárkovaný `signal-line`) a vjíždí shora (600 ms, `cubic-bezier(.2,.8,.2,1)`), starší jsou tiché, třetí poloprůhledná. U každé jméno, zdroj (web, e-shop, QR kód), služba a čas.
- Pravá část „Týden 5.–9. října · poptávka se zařadí sama“: pět dní × čtyři časy (9:00, 10:30, 13:00, 16:00). Obsazené termíny jako `ConfirmedBlock`, prázdné čárkovaně `navy-100`. Nová poptávka se na svém místě objeví jako čárkovaný `signal` blok.
- Věrnostní karta „Tereza Malá“: 5 razítek, s cyklem přibývá jedno (`zqStamp`, 500 ms). Při plné kartě text v `reward`: „Odměna připravena: střih zdarma“, jinak „Ještě N do odměny“.
- Data ukázky (vymyšlená jména, jasně označená jako ukázka) převzít z LP-D: Tereza Malá · Barvení + střih · pá 9:00 · web; Marek Dušek · Pánský střih · čt 16:00 · e-shop; Jana Horáková · Dámský střih · út 10:30 · web; Eva Krausová · Melír · po 13:00 · QR kód; Petr Novák · Výměna zámku · st 8:00 · web; SVJ Lípa · Prohlídka střechy · pá 14:00 · web postavený v Claude Code (zkrátit na „web“, pokud se nevejde).
- **Chování:** klientská komponenta, `setInterval` 2800 ms. Zastaví se mimo viewport (`IntersectionObserver`), při skryté záložce (`visibilitychange`) a při `prefers-reduced-motion` (pak ukazuje statický stav: 3 poptávky, nejnovější v kalendáři, karta 4/5). Nic v ukázce není klikací, takže nemá ani falešné hover stavy. Pro čtečky `aria-live="off"` a krátký popis v `aria-label`, aby každé 3 s nic nehlásila.
- Mobil (390 px): ukázka bez kalendáře, jen seznam příchozích a věrnostní karta pod ním (podle promptu S04).

### 4.2 Pás oborů

Úzký světlý pás těsně pod přetékající ukázkou. Nekonečně běžící řada oborů se znakem 2×2 jako odrážkou: Kadeřnictví · Kosmetika · Zámečnictví · Studnařství · Likvidace azbestu · Autoservis · Úklid · Stavba a řemesla. CSS `zq-marquee`, při hoveru se zastaví, při `prefers-reduced-motion` stojí a zalomí se do řádků. Pro čtečky jeden seznam (`aria-label="Obory"`), duplikát smyčky `aria-hidden`.

### 4.3 01 Proč to řešit (`#proc`), nová sekce (R-031)

Plní roli sekce „Proč to řešit“ z `PLAN.md`: srovnání dnes a se ZakazIQ. Je to jediné místo, kde je vidět „před“.

**Kompozice:** asymetrická, dva sloupce v poměru zhruba 5 : 7. Vlevo „Dnes“: rozházené kousky natočené o pár stupňů a mírně přes sebe, v tlumených barvách (`surface` s okrajem `navy-100`, text `quiet`):
- SMS „Dobrý den, máte v pátek volno?“
- zpráva z Instagramu „Kolik stojí melír?“
- e-mail „Poptávka: výměna zámku“
- stránka diáře s přeškrtnutým termínem
- buňka tabulky „faktura 03: zaplaceno?“

Vpravo „Se ZakazIQ“: stejné kousky jako dílky srovnané v jedné mřížce, tedy malý výřez obrazovky Dnes. Při prvním zobrazení sekce kousky jednou „přeletí“ zleva do mřížky (Framer Motion `layout`, 700 ms, stagger 80 ms). Je to jediná animace sekce a vysvětluje pointu. Při `prefers-reduced-motion` jsou oba stavy rovnou vedle sebe.

**Texty:**
- Štítek: `01 — PROČ TO ŘEŠIT`
- **H2:** „Poptávky chodí odevšad. *Přehled máte na jednom místě.*“
- Text (první osoba): „Poptávka přijde esemeskou, další na Instagram a třetí do e-mailu. Termín skončí v diáři, faktura v tabulce a kdo dlouho nepřišel, to si nikdo nepamatuje. ZakazIQ jsem udělal, aby tohle všechno leželo na jedné obrazovce.“
- Popisky sloupců (mono, verzálky): `DNES` / `SE ZAKAZIQ`

Žádná čísla („ušetříte 5 hodin týdně“). Nemáme je.

### 4.4 02 Co to umí (`#funkce`)

**Kompozice:** nadpis vlevo, štítek sekce vpravo na stejné účaří. Pod tím tři karty `surface`, ale **každá jiná**: první široká (2/3 šířky na desktopu) s ilustrací poptávky, druhá a třetí pod sebou vpravo. Žádná ikona, horní část každé karty je živá ilustrace na `navy-50`, spodní text.

- Štítek: `02 — CO TO UMÍ`
- **H2:** „Tři věci, které vám *vrátí čas.*“

| Karta | Ilustrace | Štítek | H3 | Text |
|---|---|---|---|---|
| 1 | potvrzený termín „Marek Dušek · pánský střih“, pod ním nová poptávka (`NewRequestBlock`, synchronizovaná s hero) a pilulka „Potvrdit jedním klikem“ | `01 · POPTÁVKY` | Poptávka rovnou v kalendáři | Z webu, e-shopu i telefonu. Potvrdíte ji v aplikaci nebo přímo z e-mailu. |
| 2 | věrnostní karta s 5 razítky (`LoyaltyCard`), razítka přibývají | `02 · ZÁKAZNÍCI` | Zákazníci se vracejí | Karta se razítkuje sama. A když někdo dlouho nepřišel, ZakazIQ vám řekne, komu napsat. |
| 3 | sloupcový graf „Příjmy · kvě–říj“, 6 sloupců vyroste zdola (`zq-grow`, stagger 120 ms, jednou při zobrazení), poslední `navy-700`; částka `Money` | `03 · PENÍZE` | Víte, kolik vyděláváte | Faktury, příjmy, výdaje a odhad daní. Každý měsíc vám přijde přehled e-mailem. |

Částka v grafu (v LP-D „48 300 Kč“) je ukázková. Karta má proto štítek „ukázka“, nebo graf částku neukazuje. O tom rozhodne S04 podle vzhledu. Daně všude jako **odhad**, nikdy jako „spočítáme vám daně“.

### 4.5 03 Jak to funguje (`#jak-to-funguje`)

**Kompozice:** tmavý zaoblený panel (`navy-950`, 32 px) uvnitř obsahu, ne přes celou šířku. V pozadí řídké pole dílků (4 velké dílky v rohu, jako zvětšené logo). Nadpis vlevo, štítek vpravo, pod tím 4 kroky vedle sebe (mobil pod sebou). Každý krok má nahoře ukazatel postupu.

- Štítek: `03 — JAK TO FUNGUJE`
- **H2:** „Jedna poptávka. *Nula přepisování.*“

| # | Krok | Text |
|---|---|---|
| 01 | Zákazník se objedná | Na webu, přes odkaz nebo QR kód na pultu. |
| 02 | Zařadí se do kalendáře | Jako čárkovaný blok. Hned vidíte, kam padne. |
| 03 | Potvrdíte jedním klikem | V aplikaci nebo přímo z e-mailu. |
| 04 | Zbytek se počítá sám | Razítko, příjem do přehledu, připomínka. |

**Pohyb:** aktivní krok je bílá karta s `navy-950` textem a ukazatel se plní 2,8 s. Hotové kroky mají plný ukazatel `navy-300`, budoucí prázdný. Cyklus běží jen ve viewportu. Kliknutí, hover nebo focus na kroku cyklus zastaví a ukáže ten krok. Pod kroky tichý odkaz „Přehrát znovu“ (z `PLAN.md`). Při `prefers-reduced-motion` všechny kroky staticky, bez ukazatelů.

### 4.6 04 Skládejte si to po dílcích (`#funkce-seznam`)

**Kompozice:** mozaika 9 dlaždic 3 × 3 (mobil 2 sloupce), dlaždice min. 150 px, rádius 22 px. Barvy se střídají podle LP-D: `navy-700` / `navy-100` / `surface` s okrajem / `navy-800`, takže mřížka působí jako skládačka, ne tabulka. Číslo vlevo nahoře (mono), název a popis dole.

- Štítek: `04 — FUNKCE · VŠECHNY V CENĚ` (v LP-D „MODULY“, v textech pro lidi „funkce“, viz slovník)
- **H2:** „Skládejte si to *po dílcích.*“
- Krátký text pod nadpisem: „Zapnete si jen to, co potřebujete. Vypnutá funkce zmizí z menu a data zůstanou.“

| # | Funkce | Popis |
|---|---|---|
| 01 | Poptávky | z webu, e-shopu, ručně |
| 02 | Kalendář a rezervace | služby, směny, blokace |
| 03 | Zákazníci | historie, poznámky, skupiny |
| 04 | Věrnostní karty | razítka a odměny |
| 05 | Zakázky | vlastní stavy a kolonky |
| 06 | Faktury | PDF a hlídání splatnosti |
| 07 | Příjmy a výdaje | graf a přehled měsíce |
| 08 | Daně | odhad a termíny |
| 09 | E-maily zákazníkům | potvrzení, připomínky |

Hover: dlaždice se o 2 px nadzvedne a znak 2×2 v rohu se „složí“ (dva dílky prohodí odstín). Žádné zvětšení celé dlaždice.

### 4.7 05 Napojení na váš web (`#napojeni`)

**Kompozice:** dva sloupce, text vlevo, terminálová karta vpravo (`navy-950`, tři tečky okna nahoře, mono písmo). Karta „píše“ tři řádky postupně (jednou při zobrazení), u třetího bliká kurzor (`zq-blink`). Na konci řádek s Lucide `Check` v `navy-300`: „napojení ověřeno · první poptávka přijata“.

- Štítek: `05 — NAPOJENÍ NA VÁŠ WEB`
- **H2:** „Web vám postavím *a rovnou napojím.*“
- Text: „Nemáte web? Dostanete stránku pro objednání a QR kód na pult. Máte web? Stačí jeden řádek kódu. Napojení si ověříte jedním klikem.“

Obsah terminálové karty (cesty podle R-016, **ne** `/w/lenka.js` z mockupu):

```
01 · odkaz pro objednání
zakaziq.cz/r/kadernictvi-lenka

02 · jeden řádek na web
<script src="https://zakaziq.cz/embed/kadernictvi-lenka.js"></script>

03 · web postavený v Claude Code
„napoj formulář na ZakazIQ“▍
```

„kadernictvi-lenka“ je ukázkový název. Odkaz na reference (z `PLAN.md`) se nedává, protože žádné nejsou.

### 4.8 06 Ceník (`#cenik`)

**Kompozice:** tmavý panel `navy-950` (32 px) se dvěma sloupci. Vlevo cena, vpravo seznam „v ceně“ a tlačítko. V pozadí levé půlky pole dílků 56 px, každý pátý plný bílý, ostatní jen obrys (podle LP-D), staticky.

- Štítek: `06 — CENÍK`
- **H2:** „Jedna cena. *Žádné balíčky.*“
- Cena: **249 Kč** (mono, velké) + „/ měsíc“
- Pod cenou (mono, drobné): „konečná cena, nic se nepřipočítává · prvních 14 dní zdarma · zrušíte kdykoli · karta, Apple Pay, Google Pay“ (nahrazuje `[DPH: DOPLNIT]` z mockupu, R-018, R-038)
- **V ceně** (odrážky s Lucide `Check`, ne s „✓“ znakem):
  - Neomezené poptávky a zákazníci
  - Kalendář a rezervace
  - Věrnostní karty
  - Faktury, příjmy, odhad daní
  - E-maily zákazníkům
  - Napojení na web
  - Měsíční přehled
  - Jeden byznys a neomezeně pracovníků
- Tlačítko: „Začít za 249 Kč měsíčně“ → `/w/registrace` (bílá pilulka)

Nikde „+ DPH“, žádná srovnávací tabulka balíčků, žádné přeškrtnuté ceny.

### 4.9 07 Dotazy (`#dotazy`)

**Kompozice:** úzká, skoro textová sekce. Nadpis vlevo v užším sloupci (sticky na desktopu), akordeon vpravo. Otevřený dotaz má `+` otočené na `×` (200 ms). Akordeon přes `<details>/<summary>` nebo Radix, ovladatelný klávesnicí. Odpovědi se později použijí pro `FAQPage` (S05).

- Štítek: `07 — DOTAZY`
- **H2:** „Na co se *ptáte.*“

| Dotaz | Odpověď |
|---|---|
| Musím umět s počítačem? | Ne. Když zvládnete e-mail v telefonu, zvládnete i ZakazIQ. Po registraci vyberete obor a aplikace má hned připravené služby a kolonky. |
| Jak napojím svůj web? | Třemi způsoby. Pošlete zákazníkům odkaz na objednání, vložíte na web jeden řádek kódu, nebo vám web postavím a napojím sám. Napojení si pak ověříte jedním klikem. |
| Co když nemám web? | Nevadí. Dostanete vlastní stránku pro objednání a QR kód. Odkaz dáte na Instagram, do Google profilu nebo na pult. |
| Kde jsou moje data a kdo je vidí? | Vidíte je jen vy a lidé, které do účtu pozvete. Data každé firmy jsou oddělená od ostatních. `[DOPLNIT: kde jsou data uložená]` Podrobnosti najdete v Ochraně údajů. |
| Co se stane po 14 dnech? | Pokud předplatné do té doby nezrušíte, strhneme z karty 249 Kč a dál každý měsíc. Týden předem vám přijde připomínka e-mailem. Když ho zrušíte, nic nezaplatíte a k datům se dostanete dál, jen je nepůjde měnit. |
| Můžu předplatné kdykoli zrušit? | Ano, sami v nastavení účtu. Data se nemažou, zůstanou vám k nahlédnutí. |
| Funguje to na telefonu? | Ano. Aplikace je dělaná tak, aby šla ovládat jednou rukou mezi dvěma zákazníky. |
| Kde najdu pomoc, když se něco nedaří? | Napište mi na `[DOPLNIT e-mail podpory]`. |

Odpovědi o zkušební době a zrušení stojí na R-038 a `AGENTS.md` → B5 (bez předplatného jen čtení, data se nemažou). Před spuštěním (S19) je ověřit proti skutečnému chování aplikace.

### 4.10 Footer

**Kompozice:** tmavá plocha `navy-950` s horními rohy 40 px. Nahoře velká výzva a tlačítko, pod tím sloupce odkazů, úplně dole řádek s copyrightem a nenápadným odkazem Admin.

- Výzva: „Začněte ještě dnes. *Za tři minuty.*“ (cíl z `AGENTS.md` → B9. Když se v S07 ukáže, že registrace trvá déle, text se změní.)
- Tlačítko: „Začít za 249 Kč měsíčně“ → `/w/registrace`
- Sloupec **Produkt:** Funkce (`#funkce`) · Ceník (`#cenik`) · Dotazy (`#dotazy`). Odkaz „Novinky“ z mockupu se vynechává, stránka neexistuje (vznikne v S15).
- Sloupec **Právní:** Podmínky (`/podminky`) · Ochrana údajů (`/ochrana-udaju`) · Zpracovatelská smlouva (`/zpracovatelska-smlouva`)
- Sloupec **Podpora:** „Napište nám“ + e-mail `[DOPLNIT]` jako `mailto:` odkaz (R-032)
- Spodní řádek: „© 2026 ZakazIQ · IČO [DOPLNIT]“ vlevo, vpravo „Admin“ → `/login` (`quiet`/`navy-400`, malé písmo, žádné zvýraznění).

### 4.11 Odchylky od mockupu LP-D (souhrn)

| V LP-D | V briefu | Proč |
|---|---|---|
| bez sekce Proč to řešit | nová sekce 01, ostatní čísla posunutá | R-031 |
| „Domluvit hovor“ (tlačítko) | „Napište nám“ (textový odkaz na e-mail podpory) | R-032 |
| `[DOMÉNA]/w/lenka.js` | `zakaziq.cz/embed/kadernictvi-lenka.js` | R-016, R-030 |
| `[DPH: DOPLNIT]` | „konečná cena, nic se nepřipočítává · prvních 14 dní zdarma“ | R-018, R-038 |
| „MODULY“ | „FUNKCE“ | slovník `zakaziq-ux-texty-cs` |
| „segmenty“ | „skupiny“ | slovník |
| znak „✓“ | Lucide `Check` | B8, ikony jen Lucide |
| footer „Novinky“ | vynecháno | stránka neexistuje |
| ceník bez limitů | + „Jeden byznys a neomezeně pracovníků“ | R-026 |
| bez štítku „ukázka“ | štítek „ukázka“ u živé ukázky a grafu | žádné údaje, které by šly číst jako skutečné |

---

## 5. Kontakt: e-mail místo formuláře (R-032)

Landing **nemá kontaktní formulář**. Kdo se chce zeptat, napíše na e-mail podpory (`[DOPLNIT]`, firemní adresa se ještě řeší). E-mail je v hero („Napište nám“), v dotazech a ve footeru, vždy jako `mailto:` odkaz.

- Adresa je v kódu **na jednom místě** (konstanta v `lib/ws/` nebo `app/(marketing)/`), aby šla doplnit jednou změnou. Dokud je `[DOPLNIT]`, odkaz se vykreslí, ale S19 ho musí doplnit (blokuje spuštění).
- Stránka tím nemá žádný veřejný vstup: žádná server action, žádný honeypot, žádný rate limit.

**Kdyby se formulář později vrátil** (rozhodnuto pro ten případ, R-032): vlastní server action v `app/(marketing)/actions.ts`. Zod s limitem délky každého pole, honeypot, rate limit přes `lib/api-rate-limit.ts` s vlastním endpointem (např. `landing_contact`) a zápis do `client_leads` přes `lib/db.ts` s vlastním popisem dalšího kroku (ne „Domluvená schůzka z chatbota“). Admin soubory se nemění, jen importují. `/api/public/leads` se nevolá: chce tajný `N8N_API_KEY` a rate limit by se počítal na IP serveru.

---

## 6. Fotky a obrázky

- Žádné fotky ani stock obrázky. Vizuál nesou ukázky aplikace, dílky a typografie.
- Ilustrace jsou React/CSS komponenty, ne obrázky, takže se nenačítají a neposouvají layout. Každá má pevnou výšku nebo `aspect-ratio`, aby animace nezpůsobila CLS.
- Jediný obrázek: **OG obrázek** 1200 × 630 (S05). Námět: tmavá plocha s polem dílků, logo, H1 „Každá poptávka *na svém místě.*“, vpravo výřez kalendáře s čárkovaným blokem nové poptávky. Generovat přes `next/og` (`opengraph-image.tsx`), písma Dílků, bez externího skriptu.
- Favicon: znak loga (2×2 dílky na `navy-700`), řeší S05.

---

## 7. Přístupnost a výkon

- Kontrast min. WCAG AA (`quiet` na `ground` 6.6:1, `navy-500` na `ground` 4.6:1). Text na tmavém min. `navy-200`. `navy-400` jen pro drobné popisky, kde kontrast ověřit.
- Jeden H1. H2 pro každou sekci, H3 pro karty a kroky.
- `<header>`, `<nav aria-label="Hlavní">`, `<main>`, `<section aria-labelledby>`, `<footer>`. Odkaz „Přeskočit na obsah“.
- Dekorace (`TileField`, pozadí, duplikát pásu oborů) `aria-hidden="true"` a `pointer-events-none`.
- Klávesnice: všechny odkazy, menu, akordeon a kroky Jak to funguje. Viditelný focus (`ring` z tokenů).
- Klikací plochy min. 44 px, i odkazy ve footeru na mobilu.
- `prefers-reduced-motion`: smyčky stojí, ukázky se zastaví ve statickém stavu, nájezdy sekcí vypnuté, plynulý scroll vypnutý.
- Výkon: stránka je serverová komponenta, klientské jsou jen ukázka v hero, cyklus kroků, animace sekce Proč, terminál a menu. Ostatní bez JS. Žádný obrázek nad ohybem kromě CSS. Písma přes `next/font`. Animace jen `transform` a `opacity`.
- Cíl: LCP < 2,5 s, CLS < 0,1 na mobilu (ověří S05).

---

## 8. Právní

- Stránky `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva` existují s nadpisem a textem `[DOPLNIT]`. **Právní texty se negenerují.** Skutečné texty nejpozději v S19 (R-023, otevřený problém).
- IČO ve footeru `[DOPLNIT]`.
- Bez formuláře a bez analytiky nejsou potřeba souhlas na stránce ani cookie lišta.
- Registrace a souhlas s podmínkami řeší `/w/registrace` (S07), ne landing.

---

## 9. Postup pro S04

1. Rituál začátku (`zakaziq-memory`), přečíst tenhle brief, skill `zakaziq-design-dilky` (+ `references/motion.md`, `checklist.md`) a `.claude/security/STATE.md`.
2. Smazat `app/page.tsx` (§ 3, povoleno promptem S04) a přidat odkaz „Do administrace“ pro přihlášeného admina.
3. `app/(marketing)/layout.tsx`: `force-dynamic`. `lib/security/csp.ts`: přesné cesty landing do vynucené CSP + test. Zápis do `CSP-LOG.md` a `STATE.md`.
4. Konstanty stránky (e-mail podpory, cesty CTA, data ukázky) na jednom místě.
5. Hlavička a footer (sdílené i pro právní stránky), kotvy, scrollspy, mobilní menu.
6. Sekce v pořadí § 4, každá jako vlastní komponenta v `components/marketing/` (podle promptu S04; S04 doplní složku do `AGENTS.md` → Hranice v repu). Nejdřív statický stav, pak pohyb.
7. Živá ukázka v hero: cyklus, zastavení mimo viewport, při skryté záložce a při `prefers-reduced-motion`.
8. Právní stránky se zástupným textem.
9. Kontrola: 390 / 768 / 1280 / 1440 px, klávesnice, `prefers-reduced-motion`, konzole bez chyb CSP na `/`, porovnání s LP-D a checklist Dílků, § 0 sekci po sekci.
10. `npm run build`, `npm test`, admin stránky podle `AGENTS.md` → B12. Commit `marketing: landing page` (podle promptu S04), paměť ve stejném commitu.

S05 pak dělá jen § 11 a doladění textů. Strukturu nemění.

---

## 10. Výsledný dojem

Kadeřnice, která landing otevře v telefonu, má za pět vteřin vědět, co se stane s poptávkou z jejího webu, a vidět, že to sama zvládne. Stránka má působit klidně, konkrétně a česky, jako nástroj od člověka, který malým firmám staví weby. Ne jako další zahraniční SaaS. Vede k jediné akci: zkusit to 14 dní zdarma.

---

## 11. SEO, metadata a strukturovaná data (zadání pro S05)

Provedení v S05 skilly `seo` + `seo-quality-principles`, klíčová slova případně `seo-collabim-keyword-loop` (R-022). Tady jen co se má stát:

- **Klíčová slova:** ověřit, nic nepředjímat. Kandidáti k ověření: rezervační systém pro kadeřnictví, objednávkový systém pro řemeslníky, správa poptávek, věrnostní karta pro salon, evidence zákazníků pro malou firmu. Rozhodnout, jestli `/cenik` jako samostatná stránka (§ 3).
- **Metadata:** `title`, `description`, `canonical` na `https://zakaziq.cz/`, `lang="cs"`, `metadataBase`. Právní stránky: vlastní title, do vyplnění textů zvážit `noindex`.
- **Open Graph a Twitter:** OG obrázek podle § 6, `og:locale` `cs_CZ`.
- **Strukturovaná data (JSON-LD, s nonce):** `SoftwareApplication` (`applicationCategory: BusinessApplication`, `offers` 249 CZK měsíčně), `Organization` (jméno, URL, logo, e-mail podpory, až bude), `FAQPage` z § 4.9. Žádné `aggregateRating` ani recenze, nemáme je.
- **`sitemap.xml` a `robots.txt`:** přes `app/sitemap.ts` a `app/robots.ts`. Admin cesty (`/dashboard`, `/alteno`, `/hub`, `/login`, `/p`, `/h`) a `/w` v `robots.txt` zakázat.
- **Texty:** doladit H1/H2 a perexy kvůli klíčovým slovům, potom znovu `humanize-text-cs`. Fakta (cena, 14 dní, R-016–R-033) se nemění.
- **Výkon:** změřit LCP/CLS/INP na produkčním buildu (§ 7).

---

**Poznámka pro Claude Code:** piš čistý, okomentovaný kód (česky), drž konvence `AGENTS.md` → B11 a strukturuj stránku tak, aby šly doplnit `[DOPLNIT]` údaje bez zásahu do struktury. Před dokončením každé sekce se zeptej sám sebe: *je tohle záměrná práce pro ZakazIQ, nebo obecná šablona?* Když to druhé, předělej podle § 0.
