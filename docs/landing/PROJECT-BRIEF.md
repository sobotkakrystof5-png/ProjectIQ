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
- **Ikonové trojice.** Tři karty s ikonou nahoře, nadpisem a dvěma řádky textu. Kalendář, zákaznice a peníze mají vlastní produktovou kompozici, nikoli tři stejné karty. Moduly jsou dlaždice v odstínech modré, ne mřížka ikon.
- **Hero „nadpis uprostřed, dvě tlačítka, obrázek vpravo“.** Hero má tmavé pozadí s motivem dílků; příběh kalendáře leží na klidné souvislé ploše. Nadpis je jedna věta jedním písmem (R-078) a pod ním je ovladatelná scéna kalendáře. Hlavní tlačítko je jen jedno, vedlejší akce je tichý textový odkaz.
- **Generické gradienty, glassmorphism, 3D ilustrace, stock fotky.** Vizuální jazyk zůstává v odstínech Dílků. Na Landing patří jemné radiální světlo, barevně reagující pole dílků v hero a malá perspektiva podle kurzoru; produktová karta a přechod poptávky smějí mít vlastní stavový pohyb. Žádné skleněné panely ani náhodně rozházené efekty. Fotky žádné, místo nich ukázky skutečných obrazovek.
- **„Fade-in + slide-up“ na všem.** Nájezd sekcí smí být jen jeden (`zq-rise`, jednou). Ostatní pohyb vysvětluje produkt: poptávka přijede, zařadí se do kalendáře, razítko vyskočí. Co nic nevysvětluje, se nehýbe.
- **Obecné marketingové fráze.** Žádné „revoluční“, „all-in-one“, „posuňte svůj byznys“, „jsme tým profesionálů“. Píše zakladatel v první osobě a jen to, co produkt skutečně umí.
- **Stejný rytmus všech sekcí.** Sekce se liší kompozicí i hustotou: kalendář s příběhem, otevřená kapitola zákaznice, tmavá kapitola peněz, barevná mozaika modulů, kódová ukázka s motivem dílků, tmavý ceník s polem dílků, úzký sloupec dotazů. Dekorativní rámečky kolem příběhů a textu se nepřidávají; ohraničení zůstává tam, kde označuje ovládací prvek nebo skutečnou obrazovku.
- **Výchozí písmo bez charakteru.** Instrument Sans 600 s těsným prokladem (`-0.02em` až `-0.035em`), nadpisy bez serifové kurzívy (R-078); čísla, časy a částky v JetBrains Mono. Inter se tu nepoužívá.

**Místo toho:**

- **Podpisový motiv: dílky 2×2 z loga jako skládání byznysu „po dílcích“.** Logo je čtverec se čtyřmi dílky a stejný princip nese celá stránka:
  - **pole dílků** na vybraných tmavých plochách: v hero plná mřížka čtverců 44 px v původních barvách, kurzor rozsvěcí její část a klik vyšle krátkou vlnu; jemný náklon zůstává omezený na plochu. Kalendářový příběh má vlastní souvislou tmavou plochu;
  - **moduly** jsou dílky různých odstínů modré, které si člověk „skládá“;
  - **razítka** na věrnostní kartě jsou bílé dílky se zaoblením;
  - **znak 2×2** (5 px) slouží jako odrážka v pásu oborů a u štítků.
  Motiv je podpis, ne tapeta. Každá sekce ho použije nejvýš jednou.
- **Živá ukázka aplikace místo screenshotu.** Poptávky přijíždějí, blok se zařadí do týdne, karta dostane razítko. Návštěvník pochopí produkt dřív, než dočte perex.
- **Mikrointerakce podle obsahu.** Klik na poptávku ji potvrdí v místní ukázce; přepínač funkce ukáže její vypnutý stav; kliknutí na krok ukáže odpovídající stav. Jemný pohyb potvrzeného termínu a reakce mřížky vysvětlují právě probíhající akci. Žádné obecné `scale-105`.
- Před dokončením každé sekce si polož otázku: *je tohle navržené pro ZakazIQ, nebo by to fungovalo na jakémkoli SaaS?* Když to druhé, předělat. Když si nejsi jistý, zeptej se.

---

## 1. Kontext a obsah

| | |
|---|---|
| **Produkt** | ZakazIQ Workspace, přehled podnikání pro malé firmy, které dostávají poptávky |
| **Provozovatel** | Kryštof Sobotka (VIZEON, ALTENO), OSVČ, neplátce DPH |
| **IČO** | `29977231` (Kryštof potvrdil 2026-10-31; úplné právní jméno a adresa sídla stále chybí) |
| **Doména** | `zakaziq.cz` (R-030), landing na `/`, aplikace na `/w` (R-017) |
| **E-mail podpory** | `info@vizeon.cz` (Kryštof potvrdil 2026-10-31) |
| **Telefon, adresa** | na landing page nejsou |

**Co produkt umí** (zdroj: `docs/workspace/PLAN.md`, nic navíc): poptávka z webu se sama objeví v kalendáři jako čárkovaný blok a potvrdí se jedním klikem. Zákazník dostane e-mail a po návštěvě razítko na věrnostní kartu. Dál zákazníci se skupinami (Noví, Stálí, Jednorázoví, Spící, Ukončení) a panelem „Komu napsat“, zakázky s vlastními stavy a kolonkami, faktury, příjmy a výdaje, odhad daní a měsíční přehled e-mailem. Šablony podle oboru. Napojení webu třemi cestami.

**Cena:** 249 Kč měsíčně, konečná cena bez DPH navíc (R-018). Prvních 14 dní zdarma, karta se zadává při registraci (R-038, nahradilo R-019). V ceně 1 byznys a neomezeně pracovníků, všechny funkce (R-026).

**Obory** (pás oborů, šablony): Kadeřnictví, Kosmetika, Zámečnictví, Studnařství, Likvidace azbestu, Autoservis, Úklid, Stavba a řemesla.

**Cíl stránky:** registrace (`/w/registrace`). Jedna hlavní akce na celé stránce: „Vyzkoušet 14 dní zdarma“. Vedlejší cesta je kontakt na podporu, pro lidi, kteří se chtějí nejdřív zeptat. Podmínky u CTA vždy jasně uvádějí kartu při registraci, první platbu po 14 dnech, cenu 249 Kč měsíčně a možnost kdykoli zrušit.

**Tón:** přímý, v první osobě zakladatele („Web vám postavím a rovnou napojím.“), bez superlativů, oslovení „vy“. Čtenář je kadeřnice nebo zámečník s telefonem v ruce, žádný IT člověk. Pravidla a slovník: skill `zakaziq-ux-texty-cs` (v textech „funkce“, ne „modul“; „skupina“, ne „segment“; „účet“, ne „workspace“). Žádné technické termíny mimo sekci Napojení, kde smí padnout „kód“.

**Co nemáme a nevymýšlíme:** počty klientů, recenze, citace, loga zákazníků, procenta úspor, reference. Sekce „Kdo za tím stojí“ se nedělá (R-023). Pilotní klient zatím není, takže sociální důkaz na stránce nebude. Až bude, přidá se jako samostatný krok.

**Prodejní princip:** návštěvník má snadno pochopit, co produkt udělá v jeho běžném dni a co dostane za 249 Kč. Ukazujeme skutečné produktové stavy, jasnou cestu do registrace a pravdivé podmínky zkušební doby vedle výzvy. Nepoužíváme falešnou naléhavost, vymyšlené výsledky ani skryté podmínky.

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

**Typografie:** H1 88 px / mobil 40 px, H2 56/28, H3 26/20, tělo 17/15, drobné 13/12. H1 a H2 jsou jedna obyčejná věta jedním písmem, bez kurzívy a bez štítku nebo čísla sekce nad nimi (R-078). Popisky „Ukázka“ malými písmeny v textovém písmu.

**Tvary:** tlačítka a navigace jako pilulky, výška min. 44 px. Karty 20–24 px, velké panely 32 px, hero a footer 40 px. Okraje 1 px `navy-100`, stín jen u plovoucích prvků a věrnostní karty.

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
Hero „Zákazníci se objednají sami.“ + střídmý motiv dílků + ovladatelný příběh v kalendáři
Pás oborů
01 Proč to řešit            (nové oproti LP-D)
02 Co to umí                (#funkce)
03 Jak to funguje           (#jak-to-funguje)
04 Funkce: Zapněte si jen to, co použijete
05 Napojení na váš web      (#napojeni)
06 Ceník                    (#cenik)
07 Dotazy                   (#dotazy)
Footer s výzvou a odkazem Admin
```

Texty níže jsou návrh (prošly `zakaziq-ux-texty-cs` a `humanize-text-cs`). S05 je doladí kvůli vyhledávání, fakta se měnit nesmí.

### 4.0 Hlavička

- Uvnitř tmavého hero, není to samostatný bílý pruh. Vlevo `Logo` + „ZakazIQ“. Uprostřed pilulková navigace (průhledná pilulka s okrajem `navy-200/15`): **Funkce · Jak to funguje · Napojení webu · Ceník**. Vpravo „Přihlásit“ (tichý odkaz) a „14 dní zdarma“ (bílá pilulka, `navy-950` text).
- Po odjetí z hero se hlavička přichytí nahoře jako kompaktní tmavá pilulka. Bez rozmazaného skla, plné `navy-950/95`.
- Mobil: logo + „Zkusit zdarma“ + tlačítko menu (`aria-label="Otevřít menu"`), menu jako panel shora se stejnými kotvami a odkazem Přihlásit.
- Odkazy: „Přihlásit“ → `/w/prihlaseni`, „14 dní zdarma“ → `/w/registrace`. Přesné cesty Clerku potvrdí S07. Do té doby vedou na 404 a to je v pořádku.

### 4.1 Hero

**Kompozice:** tmavá plocha Dílků s plnou interaktivní mřížkou v původních barvách, nadpisem vlevo a kalendářovým příběhem na souvislém pozadí. Ukazatel jemně rozsvítí dílky, plocha se nepatrně nakloní; kliknutí vyšle krátkou vlnu. Na telefonu zůstává motiv viditelný a neblokuje obsah. Pod úvodem je otevřená kalendářová scéna s detailem poptávky; od 1024 px a při výšce nad 700 px zůstává scéna při průchodu kroky přichycená, scroll se nepřebírá. Na menších šířkách a nízkých obrazovkách scéna zůstává v běžném toku, aby nezakryla příběh. Na telefonu ukazuje jediný den a kompaktní detail. Věrnostní karta patří až do kapitoly zákaznice.

**Texty:**

- Štítek: „Ukázka · jedna poptávka od začátku do konce“.
- **H1:** „Zákazníci se objednají sami.“
- **Perex:** „ZakazIQ je přehled podnikání pro malé firmy. Poptávky z webu, kalendář, zákazníci a věrnostní karty, zakázky, faktury a odhad daní v jedné aplikaci pro telefon i počítač.“
- **Hlavní tlačítko:** „Vyzkoušet 14 dní zdarma“ → `/w/registrace` (bílá pilulka).
- **Vedlejší odkaz:** „Napište nám“ → `mailto:[DOPLNIT e-mail podpory]` (textový odkaz `navy-200` s podtržením při hoveru, žádné druhé tlačítko).
- **Podmínky zkušební doby:** „14 dní zdarma · kartu zadáte při registraci · poté 249 Kč měsíčně · zrušíte kdykoli“. Karta se zadává při registraci a první platba proběhne až po 14 dnech.

**Ovladatelná ukázka** (`components/marketing/live-demo.tsx`):

- Fiktivní příběh Terezy Malé, barvení + střih, pátek 9. 10. 2026, 9:00–10:30. Všechny scény nesou označení „Ukázka“.
- Tři stavy: čárkovaná poptávka → detail vedle kalendáře → potvrzený termín. Kliknutí do bloku otevře detail, „Potvrdit termín“ změní podobu bloku. Jde o místní demonstraci, žádný zápis ani e-mail se neodesílá.
- Tlačítka kroků, odkazy v příběhu a běžný scroll. Scroll přepíná krok podle kapitoly, která je ve výhledu, oběma směry (od 2026-10-17); klik na krok platí do přechodu na jinou kapitolu. Focus v ukázce scroll nepřeruší.
- Bez intervalu a časové smyčky. Změna barev 300 ms, při omezeném pohybu bez přechodu.
- Pod 640 px jeden páteční sloupec; od 640 px pětidenní přehled. Detail je na menších šířkách pod kalendářem, od 1024 px vedle něj.
- Návazný odkaz vede do kapitoly zákaznice. Kapitola peněz rozlišuje potvrzený termín a zaznamenanou platbu.

### 4.2 Pás oborů

Úzký světlý pás těsně pod přetékající ukázkou. Nekonečně běžící řada oborů se znakem 2×2 jako odrážkou: Kadeřnictví · Kosmetika · Zámečnictví · Studnařství · Likvidace azbestu · Autoservis · Úklid · Stavba a řemesla. CSS `zq-marquee`, při hoveru se zastaví, při `prefers-reduced-motion` stojí a zalomí se do řádků. Pro čtečky jeden seznam (`aria-label="Obory"`), duplikát smyčky `aria-hidden`.

### 4.3 01 Proč to řešit (`#proc`), nová sekce (R-031, přepracováno 2026-10-17)

Plní roli sekce „Proč to řešit“ z `PLAN.md`: problém a jeho řešení. Je to jediné místo, kde je vidět „před“. Původní rozházené kousky (SMS, Instagram, diář) Kryštof odmítl jako bezvýznamné a „moc AI“.

**Kompozice (přepracováno 2026-10-17, stejný přístup jako 04 Funkce):** čtyři pásy jednoho dne. Každý má velký čas (mono, 44 px) a štítek „Dnes“. Problém je krátký nadpis a jedna věta. Vpravo štítek „Se ZakazIQ“, jedna věta řešení a výřez skutečného rozhraní označený „Ukázka“. Na desktopu dva sloupce vycentrované vertikálně, na telefonu pod sebou. Pás 10:40 je tmavý a hlavní (poptávka ve `signal`), ostatní jsou `surface` s okrajem nebo `navy-50`. Výřezy jsou `aria-hidden`, text vedle říká totéž. Jediný pohyb: pás jednou najede zdola (`Reveal`).

- Štítek: `01 — PROČ TO ŘEŠIT`
- **H2:** „Den, kdy máte plné ruce.“
- Text (první osoba): „Firmu vedete z telefonu a diáře. Něco občas uteče, hlavně když máte plné ruce. ZakazIQ jsem postavil pro tyhle chvíle.“

| Kdy | Dnes (problém) | Se ZakazIQ (řešení) | Výřez |
|---|---|---|---|
| 10:40 | Stříháte a telefon pípne. „Máte v pátek volno?“ Odpovíte až večer. Zákaznice mezitím může jít jinam. | Zákaznice si vybere čas sama. Vy potvrdíte jedním klikem, až budete mít chvilku. | nová poptávka Tereza Malá, pá 9:00–10:30, Potvrdit termín, Jiný čas (tmavý pás) |
| 14:05 | Zákazník volá, že to nestihne. Přepisujete termín v diáři a doufáte, že nekoliduje s jiným. | Termín posunete. Obsazený čas kalendář nepustí a zákazník dostane e-mail se změnou. | přesun Terezy Malé z pá 9:00–10:30 na pá 11:00–12:30 |
| 19:30 | Večer počítáte, kdo zaplatil. Něco přišlo na účet, něco v hotovosti. Faktury máte v tabulce a na konci roku to skládáte znovu. | Platba se zapíše k návštěvě a objeví se v přehledu měsíce. Odhad daní vidíte během roku. | příjmy říjen, Tereza Malá, 1 850 Kč, Zaplaceno (stejná data jako kapitola Peníze) |
| Za půl roku | Stálá zákaznice přestala chodit. Všimnete si, až ji potkáte na ulici. | ZakazIQ ji zařadí mezi Spící. Zprávu pro ni máte připravenou v panelu Komu napsat. | skupina Spící, Jana, naposledy 14. 4., Připravit zprávu |

Žádná čísla („ušetříte 5 hodin týdně“) ani statistiky ztracených zákazníků. Nemáme je.

### 4.4 02 Co to umí (`#funkce`)

**Kompozice:** dvě produktové kapitoly místo opakovaných karet. Nadpis „Co vám zůstane po návštěvě.“ Kalendář je hlavní scénou v úvodu.

- **Zákazníci:** asymetrická kompozice „Každá zákaznice má svou kartu.“ Karta Terezy Malé s historií návštěvy a věrnostní kartou 4/5. Podmínka razítka je vysvětlená: návštěva a zaznamenaná platba podle nastavení věrnosti. Bez samovolného přidávání razítek.
- **Peníze:** široká tmavá kapitola „Příjmy vidíte průběžně.“ Světlý výřez říjnových příjmů s fiktivní platbou Terezy 1 850 Kč a rozpisem. Částky označené jako ukázkové. Potvrzení termínu samo o sobě není příjem.
- Zachované údaje: historie, poznámky, věrnost a komu napsat; faktury, příjmy, výdaje, odhad daní a měsíční přehled e-mailem.

### 4.5 03 Jak to funguje (`#jak-to-funguje`)

Čtyři ručně ovládané kroky bez časovaného přehrávání. Tlačítka přepínají odpovídající scénu, scroll vybírá krok podle jeho textu; po dokončení se nic nepřehrává znovu. Scéna je přichycená jen na široké, dostatečně vysoké obrazovce, na telefonu a tabletu zůstává v toku stránky.

1. Zákazník se objedná na webu, přes odkaz nebo QR kód.
2. Poptávka se ukáže v kalendáři jako čárkovaný blok.
3. Potvrdíte termín v aplikaci nebo z e-mailu a zákazník dostane potvrzení.
4. Po návštěvě zapíšete platbu; příjem se ukáže v přehledu a podle nastavení přibude razítko.

Nadpis „Od objednávky po zaplacení.“ (R-078). Jedinou příběhovou ukázkou je kalendář v úvodu.

### 4.6 04 Zapněte si jen to, co použijete (`#funkce-seznam`)

**Kompozice (R-057, 2026-10-17):** asymetrická mozaika dílků, ne mřížka 3 × 3. Velikost podle důležitosti: Poptávky 5/12 (tmavá plocha, nová poptávka ve `signal`), Kalendář 7/12 (hlavní plocha). Zákazníci a Věrnostní karty jsou dvojice od 1024 px, Zakázky přes celou šířku; od 1280 px je to řada tří. Faktury, Příjmy, Daně (tmavá) a E-maily jsou dvojice od 1024 px a řada čtyř od 1280 px. Mobil jeden sloupec, tablet dva. Znak Dílků vlevo nahoře, název a popis pod ním; bez dekorativních čísel a vnějších čarovaných rámečků. Každá dlaždice obsahuje kus skutečného rozhraní označený „Ukázka“; fiktivní údaje (Tereza Malá, 1 850 Kč) jsou stejné jako v kapitolách Zákaznice a Peníze.

- Štítek: `04 — FUNKCE · VŠECHNY V CENĚ` (v LP-D „MODULY“, v textech pro lidi „funkce“, viz slovník)
- **H2:** „Zapněte si jen to, co použijete.“
- Krátký text pod nadpisem: „Zapněte si jen to, co potřebujete. Vypnutá funkce zmizí z menu a data zůstanou.“ Pod ním: „Přepínače na kartách si můžete vyzkoušet. Je to jen ukázka, vaše nastavení se tím nemění.“

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

**Přepínače:** jen u šesti modulů, které jdou v Nastavení › Funkce skutečně vypnout (Kalendář, Zakázky, Věrnostní karty, Faktury, Příjmy a výdaje, Daně). Poptávky a Zákazníci mají štítek „Vždy v menu“, E-maily nejsou modul a štítek odkazuje do Nastavení › E-maily. Pravidla jako v aplikaci (`lib/ws/settings.ts`): zapnutí Daní zapne Příjmy, vypnutí Příjmů vypne Daně. Vypnutý stav má klidnější tón, říká „Funkce je vypnutá“ a potvrzuje, že data zůstanou. Dílek znaku je plný, když funkce běží, a prázdný, když ne. Přepínač je `role="switch"`, ovládá se klávesnicí, změnu hlásí `role="status"`.

**CTA pod mřížkou:** „Všechno, co tu vidíte, je v ceně. 14 dní zdarma, potom 249 Kč měsíčně.“ + `CTA_LABEL` „Vyzkoušet 14 dní zdarma“ na `ROUTES.signUp`.

Vnější dlaždice zůstávají v klidu; mění se jen barva při přepnutí. `prefers-reduced-motion` vypíná dekorativní perspektivu a přechody bez vlivu na ovládání.

Implementace: `components/marketing/modules.tsx` (sekce, přepínače, rozvržení), `components/marketing/module-previews.tsx` (ukázky), `content.ts` beze změny.

### 4.7 05 Napojení na váš web (`#napojeni`)

**Kompozice:** dva sloupce, text vlevo a tři cesty napojení vpravo na tmavé ploše s nenápadným polem dílků. Text v ukázce se objeví postupně jednou při zobrazení; nehraje si na terminál a netvrdí, že testovací napojení nebo první poptávka skutečně proběhly.

- Štítek: `05 — NAPOJENÍ NA VÁŠ WEB`
- **H2:** „Web vám postavím a rovnou napojím.“
- Text: „Nemáte web? Dostanete stránku pro objednání a QR kód na pult. Máte web? Stačí jeden řádek kódu. Napojení si ověříte jedním klikem.“

Obsah ukázky (cesty podle R-016, **ne** `/w/lenka.js` z mockupu):

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
- **H2:** „Všechny funkce za jednu cenu.“
- Cena: **249 Kč** (mono, velké) + „/ měsíc“
- Pod cenou: „Konečná cena, nic se nepřipočítává. Kartu zadáte při registraci; první platba proběhne až po 14 dnech. Zrušíte kdykoli.“ (nahrazuje `[DPH: DOPLNIT]` z mockupu, R-018, R-038)
- **V ceně** (odrážky s Lucide `Check`, ne s „✓“ znakem):
  - Neomezené poptávky a zákazníci
  - Kalendář a rezervace
  - Věrnostní karty
  - Faktury, příjmy, odhad daní
  - E-maily zákazníkům
  - Napojení na web
  - Měsíční přehled
  - Jeden byznys a neomezeně pracovníků
- Tlačítko: „Vyzkoušet 14 dní zdarma“ → `/w/registrace` (bílá pilulka)

Nikde „+ DPH“, žádná srovnávací tabulka balíčků, žádné přeškrtnuté ceny.

### 4.9 07 Dotazy (`#dotazy`)

**Kompozice:** úzká, skoro textová sekce. Nadpis vlevo v užším sloupci (sticky na desktopu), akordeon vpravo. Otevřený dotaz má `+` otočené na `×` (200 ms). Akordeon přes `<details>/<summary>` nebo Radix, ovladatelný klávesnicí. Odpovědi se později použijí pro `FAQPage` (S05).

- Štítek: `07 — DOTAZY`
- **H2:** „Než se zaregistrujete.“

| Dotaz | Odpověď |
|---|---|
| Musím umět s počítačem? | Ne. Když zvládnete e-mail v telefonu, zvládnete i ZakazIQ. Po registraci vyberete obor a aplikace má hned připravené služby a kolonky. |
| Jak napojím svůj web? | Třemi způsoby. Pošlete zákazníkům odkaz na objednání, vložíte na web jeden řádek kódu, nebo vám web postavím a napojím sám. Napojení si pak ověříte jedním klikem. |
| Co když nemám web? | Nevadí. Dostanete vlastní stránku pro objednání a QR kód. Odkaz dáte na Instagram, do Google profilu nebo na pult. |
| Kde jsou moje data a kdo je vidí? | Vidíte je jen vy a lidé, které do účtu pozvete. Data každé firmy jsou oddělená od ostatních. `[DOPLNIT: kde jsou data uložená]` Podrobnosti najdete v Ochraně údajů. |
| Co se stane po 14 dnech? | Pokud předplatné do té doby nezrušíte, strhneme z karty 249 Kč a dál každý měsíc. Týden předem vám přijde připomínka e-mailem. Když ho zrušíte, nic nezaplatíte a k datům se dostanete dál, jen je nepůjde měnit. |
| Můžu předplatné kdykoli zrušit? | Ano, sami v nastavení účtu. Data se nemažou, zůstanou vám k nahlédnutí. |
| Funguje to na telefonu? | Ano. Aplikace je dělaná tak, aby šla ovládat jednou rukou mezi dvěma zákazníky. |
| Kde najdu pomoc, když se něco nedaří? | Napište na `info@vizeon.cz` nebo použijte kontaktní formulář. Odpovíme do 24 hodin. |

Odpovědi o zkušební době a zrušení stojí na R-038 a `AGENTS.md` → B5 (bez předplatného jen čtení, data se nemažou). Před spuštěním (S19) je ověřit proti skutečnému chování aplikace.

### 4.10 Footer

**Kompozice:** tmavá plocha `navy-950` s horními rohy 40 px. Nahoře velká výzva a tlačítko, pod tím sloupce odkazů, úplně dole řádek s copyrightem a nenápadným odkazem Admin.

- Výzva: „První poptávku můžete přijmout ještě dnes.“ (R-078)
- Tlačítko: „Vyzkoušet 14 dní zdarma“ → `/w/registrace`
- Sloupec **Produkt:** Funkce (`#funkce`) · Ceník (`#cenik`) · Dotazy (`#dotazy`). Odkaz „Novinky“ z mockupu se vynechává, stránka neexistuje (vznikne v S15).
- Sloupec **Právní:** Podmínky (`/podminky`) · Ochrana údajů (`/ochrana-udaju`) · Zpracovatelská smlouva (`/zpracovatelska-smlouva`)
- Sloupec **Podpora:** odkaz na kontaktní formulář a `info@vizeon.cz` jako `mailto:` záloha (R-065)
- Spodní řádek: „© 2026 ZakazIQ · IČO 29977231“ vlevo, vpravo „Admin“ → `/login` (`quiet`/`navy-400`, malé písmo, žádné zvýraznění).

### 4.11 Odchylky od mockupu LP-D (souhrn)

| V LP-D | V briefu | Proč |
|---|---|---|
| bez sekce Proč to řešit | nová sekce 01, ostatní čísla posunutá | R-031 |
| „Domluvit hovor“ (tlačítko) | „Napište nám“ (odkaz na kontaktní formulář; e-mailová záloha) | R-032, R-065 |
| `[DOMÉNA]/w/lenka.js` | `zakaziq.cz/embed/kadernictvi-lenka.js` | R-016, R-030 |
| `[DPH: DOPLNIT]` | „konečná cena, nic se nepřipočítává · prvních 14 dní zdarma“ | R-018, R-038 |
| „MODULY“ | „FUNKCE“ | slovník `zakaziq-ux-texty-cs` |
| „segmenty“ | „skupiny“ | slovník |
| znak „✓“ | Lucide `Check` | B8, ikony jen Lucide |
| footer „Novinky“ | vynecháno | stránka neexistuje |
| ceník bez limitů | + „Jeden byznys a neomezeně pracovníků“ | R-026 |
| bez štítku „ukázka“ | štítek „ukázka“ u živé ukázky a grafu | žádné údaje, které by šly číst jako skutečné |

---

## 5. Kontakt: formulář a e-mail (R-065)

Návštěvník může napsat na `info@vizeon.cz` nebo použít formulář pod FAQ. Formulář zapíše dotaz do Hovorů (`client_leads`, `/dashboard/calls`) jako úkol odpovědět e-mailem do 24 hodin; přímý e-mail je záloha. Provozovatel musí Hovory pravidelně hlídat, automatická notifikace e-mailem se neposílá.

Server action v `app/(marketing)/actions.ts` používá Zod limity délek, honeypot, krátký časový filtr, rate limit přes `lib/api-rate-limit.ts` s endpointem `landing_contact` a zápis přes `lib/db.ts`. Admin soubory se nemění, pouze se použije existující úložiště a rate limiter. `/api/public/leads` se nevolá: vyžaduje tajný `N8N_API_KEY` a rate limit by se počítal na IP serveru. Formulář i záznam o zpracování osobních údajů musí být popsány v právních textech před veřejným spuštěním.

---

## 6. Fotky a obrázky

- Žádné fotky ani stock obrázky. Vizuál nesou ukázky aplikace, dílky a typografie.
- Ilustrace jsou React/CSS komponenty, ne obrázky, takže se nenačítají a neposouvají layout. Každá má pevnou výšku nebo `aspect-ratio`, aby animace nezpůsobila CLS.
- Jediný obrázek: **OG obrázek** 1200 × 630 (S05). Námět: tmavá plocha s polem dílků, logo, H1 „Zákazníci se objednají sami.“, vpravo výřez kalendáře s čárkovaným blokem nové poptávky. Generovat přes `next/og` (`opengraph-image.tsx`), písma Dílků, bez externího skriptu.
- Favicon: znak loga (2×2 dílky na `navy-700`), řeší S05.

---

## 7. Přístupnost a výkon

- Kontrast min. WCAG AA (`quiet` na `ground` 6.6:1, `navy-500` na `ground` 4.6:1). Text na tmavém min. `navy-200`. `navy-400` jen pro drobné popisky, kde kontrast ověřit.
- Jeden H1. H2 pro každou sekci, H3 pro karty a kroky.
- `<header>`, `<nav aria-label="Hlavní">`, `<main>`, `<section aria-labelledby>`, `<footer>`. Odkaz „Přeskočit na obsah“.
- Dekorace (`TileField`, pozadí, duplikát pásu oborů) `aria-hidden="true"` a `pointer-events-none`.
- Klávesnice: všechny odkazy, menu, akordeon a kroky Jak to funguje. Viditelný focus (`ring` z tokenů).
- Klikací plochy min. 44 px, i odkazy ve footeru na mobilu.
- `prefers-reduced-motion`: smyčky stojí, ruční ovládání ukázky funguje bez přechodů, nájezdy sekcí vypnuté, plynulý scroll vypnutý.
- Výkon: stránka je serverová komponenta, klientské jsou jen ovladatelná ukázka v hero, animace sekce Proč, napojení a menu. Ostatní bez JS. Žádný obrázek nad ohybem kromě CSS. Písma přes `next/font`. Animace jen `transform` a `opacity`.
- Cíl: LCP < 2,5 s, CLS < 0,1 na mobilu (ověří S05).

---

## 8. Právní

- Stránky `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva` existují s nadpisem a textem `[DOPLNIT]`. **Právní texty se negenerují.** Skutečné texty nejpozději v S19 (R-023, otevřený problém).
- Úplné právní jméno a sídlo provozovatele v právních textech stále `[DOPLNIT]`; IČO `29977231` je potvrzené.
- Formulář ukládá jméno, e-mail a zprávu do Hovorů. Právní texty musí uvést účel a dobu uchování před veřejným spuštěním; bez analytiky není potřeba cookie lišta.
- Registrace a souhlas s podmínkami řeší `/w/registrace` (S07), ne landing.

---

## 9. Postup pro S04

1. Rituál začátku (`zakaziq-memory`), přečíst tenhle brief, skill `zakaziq-design-dilky` (+ `references/motion.md`, `checklist.md`) a `.claude/security/STATE.md`.
2. Smazat `app/page.tsx` (§ 3, povoleno promptem S04) a přidat odkaz „Do administrace“ pro přihlášeného admina.
3. `app/(marketing)/layout.tsx`: `force-dynamic`. `lib/security/csp.ts`: přesné cesty landing do vynucené CSP + test. Zápis do `CSP-LOG.md` a `STATE.md`.
4. Konstanty stránky (e-mail podpory, cesty CTA, data ukázky) na jednom místě.
5. Hlavička a footer (sdílené i pro právní stránky), kotvy, scrollspy, mobilní menu.
6. Sekce v pořadí § 4, každá jako vlastní komponenta v `components/marketing/` (podle promptu S04; S04 doplní složku do `AGENTS.md` → Hranice v repu). Nejdřív statický stav, pak pohyb.
7. Ukázka v hero: klikání a posun scrollováním oběma směry, bez časovaného cyklu, přístupná i při `prefers-reduced-motion`.
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
