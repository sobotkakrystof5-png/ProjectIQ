---
name: zakaziq-design-dilky
description: Design systém „Dílky" pro ZakazIQ — barvy a motiv 2×2 dílků z loga, písma Instrument Sans/Serif a JetBrains Mono, tvary, pohyb a jejich převod do aplikace Workspace, klientského portálu, objednávací stránky, e-mailů a landing page. Použij vždy, když píšeš nebo upravuješ jakékoli UI mimo admin konzoli, volíš barvu, písmo, rádius, animaci, prázdný stav nebo ilustraci, nebo když kontroluješ, že obrazovka odpovídá mockupu LP-D.
---

# Design systém Dílky

Závazný vzhled ZakazIQ mimo admin konzoli. Vzor: mockup **LP-D · Podle loga ZakazIQ**
(plátno „ZakazIQ Workspace – mockupy"). Starší mockupy platí jen pro rozložení.

Princip jednou větou: **všechno vychází z loga** — tmavě modrý čtverec s mřížkou 2×2 bílých
dílků. Námořnická modrá je hlavní barva, dílky jsou opakující se motiv, jediná teplá barva
patří nové poptávce a odměně.

## 1. Tokeny

Tokeny jsou v `references/tokens.css` (CSS proměnné) a `references/tailwind-extend.ts`.
Platí jen uvnitř `[data-app="ws"]` na kořeni layoutu `app/(marketing)/`, `app/w/`, portálu
a objednávací stránky, ať se nedotknou admin konzole (ta má vlastní `:root` v `app/globals.css`).
Uvnitř `[data-app="ws"]` dostanou i shadcn/ui proměnné (`--primary`, `--border`…) hodnoty Dílků.

Názvy v Tailwindu se záměrně liší od adminu, aby se nic nepřepsalo: `navy-*`, `ground`,
`surface` (karty), `ink`, `quiet` (vedlejší text), `signal`, `reward`, `danger`; písma
`font-accent` (serif kurzíva) a `font-num` (mono); rádiusy `rounded-tiny|chip|box|panel|slab|hero`.

| Token | Hodnota | Použití |
|---|---|---|
| `navy-950` | #0c1a36 | tmavé plochy (hero, postranní panel, footer), hlavní text |
| `navy-900` | #132850 | přechody tmavých ploch |
| `navy-800` | #1b3868 | tmavé dlaždice, hover tmavých ploch |
| `navy-700` | #23478b | **hlavní akce**, aktivní položka, potvrzené termíny (okraj) |
| `navy-600` | #2b57a8 | gradient loga a věrnostní karty (spolu s 800) |
| `navy-500` | #3a6ec4 | akcentová kurzíva na světlém, čísla sekcí, odkazy |
| `navy-400` | #5c8dd3 | popisky na tmavém |
| `navy-300` | #8aaee3 | kurzíva na tmavém |
| `navy-200` | #b8ceef | text na tmavém |
| `navy-100` | #dce7f7 | okraje, potvrzené bloky |
| `navy-50` | #eef2fb | plochy ilustrací, jemné pozadí |
| `ground` | #f4f6fb | pozadí stránky |
| `surface` | #ffffff | karty |
| `quiet` | #4a5878 | vedlejší text (6.6:1 na `ground`) |
| `signal` | #ffb547 | tečka „právě dorazilo" |
| `signal-bg` | #fff7e8 | plocha nové poptávky |
| `signal-line` | #e19a2c | čárkovaný okraj nové poptávky |
| `signal-ink` | #6b4300 | text na `signal-bg` |
| `danger` | #b3261e | odmítnutí, mazání, po splatnosti |

Pravidla: `signal` **jen** pro novou poptávku, živé upozornění a připravenou odměnu. Nikdy
jako dekorace. Barvy, které se musí rozlišit (stavy), se liší i světlostí, ne jen odstínem.

## 2. Písmo

- **Instrument Sans** 400/500/600/700 — rozhraní i nadpisy. Nadpisy 600, záporné prokládání
  (`-0.02em` až `-0.035em`), řádkování 0.98–1.1.
- **Instrument Serif** italic — **jen druhá půlka nadpisu** jako akcent:
  „Každá poptávka *na svém místě.*" Na světlém `navy-500`, na tmavém `navy-300`.
  V aplikaci jen v nadpisech stránek (Dnes, Zákazníci…), nikdy v tabulkách a formulářích.
- **JetBrains Mono** — částky, časy, data, čísla sekcí, štítky (verzálky malé, 11–13 px).
- Načítat přes `next/font/google` s `display: swap` a proměnnými `--font-instrument-sans`,
  `--font-instrument-serif`, `--font-jetbrains-mono`. Inter se ve Workspace nepoužívá.

Škála (landing / aplikace): H1 88/40 · H2 56/28 · H3 26/20 · tělo 17/15 · drobné 13/12.

## 3. Tvary a prostor

- Tlačítka, filtry, štítky stavů: **pilulka** (`rounded-full`). Hlavní tlačítko `navy-700`
  (v aplikaci) nebo bílé na tmavém (landing). Výška min. 44 px.
- Rádiusy: drobné prvky 9–12 px (`tiny`, `chip`) · karty 20–24 px (`box`, `panel`) ·
  velké panely 32 px (`slab`) · hero a footer landing page 40 px (`hero`).
- Okraje 1 px `navy-100`. Stíny jen u plovoucích prvků (věrnostní karta, dialog, popover).
- Mezery v krocích 4/8 px, sekce landing page 120 px od sebe, obsah max. 1200 px.

## 4. Motiv dílků

- **Logo:** čtverec s gradientem `navy-600 → navy-800`, mřížka 2×2 bílých dílků 9 px s mezerou
  4 px; v hlavičce dva dílky (vpravo nahoře, vlevo dole) jemně dýchají (opacity 0.95 ↔ 0.4, 3 s).
- **Pole dílků** v pozadí tmavých ploch: mřížka čtverců 44 px s rádiusem 10, skoro neviditelných;
  ~9 % z nich pulzuje v `navy-500` (4–7 s, posunuté zpoždění). Jen hero, panel „Jak to funguje",
  ceník, prázdné stavy ve velkém.
- **Dlaždice** (moduly, rychlé akce) ve střídajících se odstínech `navy-700`, `navy-100`, bílá,
  `navy-800`.
- **Znak 2×2** (5 px dílky, `navy-700`/`navy-300` šachovnicově) jako odrážka u oborů a štítků.

## 5. Pohyb

Animuje se jen to, co něco vysvětluje. Podrobnosti a keyframes v `references/motion.md`.

| Situace | Animace | Délka |
|---|---|---|
| Nová poptávka v seznamu / kalendáři | vyjetí shora + zprůhlednění | 600 ms, `cubic-bezier(.2,.8,.2,1)` |
| „Právě dorazilo" | tečka `signal` s rozbíhajícím se kruhem | 1.6 s smyčka |
| Razítko na kartě | „vyskočí" (scale 0.9 → 1 + fade) | 500 ms |
| Uloženo / potvrzeno | zatržítko + krátký toast | 300 ms |
| Kroky, průvodce | výplň ukazatele postupu | podle kroku |
| Grafy | sloupce vyrostou zdola při načtení | 1 s, stagger 120 ms |
| Landing: sekce | nájezd zdola při scrollu | 700 ms, jednou |
| Landing: pozadí | pulz dílků, běžící pás oborů, kurzor u kódu | smyčky |

- Landing page smí být bohatší. **V aplikaci se animuje jen změna stavu.**
- Animace nikdy neblokuje klik ani nezdržuje práci.
- `prefers-reduced-motion: reduce` vypíná všechno kromě změny barvy.
- Framer Motion pro stavové animace v Reactu, čisté CSS keyframes pro smyčky v pozadí.

## 6. Převod do aplikace Workspace

- Postranní panel `navy-950`, logo nahoře, ikony Lucide `strokeWidth={1.5}` + popisek pod ikonou,
  aktivní položka `navy-700` pozadí s bílým textem.
- Hlavička `surface` s přepínačem byznysů (pilulky v `navy-50`), vyhledáváním ⌘K a tlačítkem „+ Nová".
- Obsah na `ground`, panely a tabulky v `surface`, okraje `navy-100`.
- **Nová poptávka všude stejně:** `signal-bg` + čárkovaný okraj `signal-line` + `signal-ink` text.
- Potvrzený termín: `navy-100` plocha, levý okraj 3 px `navy-700`, text `navy-900`.
- Blokace: `navy-50` plocha, `quiet` text.
- Věrnostní karta: gradient `navy-600 → navy-800`, bílá razítka (dílky se zaoblením),
  prázdné razítko čárkovaně, plná karta → text v `#ffd28a` „Odměna připravena".
- Částky a časy vždy JetBrains Mono.
- Tmavý režim: pozadí `navy-950`, karty `navy-900`, okraje `navy-800`, text `navy-50`/`navy-200`.

## 7. Klientský portál, objednávací stránka, e-maily

Stejný systém. Byznys si smí nastavit **logo a jednu akcentovou barvu**, která nahradí `navy-700`
u tlačítek a aktivních prvků. Struktura, písmo, rádiusy a pohyb se nemění. E-maily: bílá karta
na `ground`, hlavička s logem byznysu, tlačítko jako pilulka, částky monospace.

## 8. Z předchozích návrhů se přebírá

Rozložení „vše na jedné obrazovce" (příchozí | kalendář | karta zákazníka), čárkovaný blok
poptávky v kalendáři, panel „Komu napsat", obrazovka Peníze, vlastní kolonky s živým náhledem,
průvodce novým byznysem, mobilní Dnes se spodní lištou, číslování sekcí (01 —), monospace čísla,
„záznam" kroků poptávky, ceník s položkami „v ceně".

## 9. Nikdy

- Výchozí šedý shadcn motiv, modrobílá „AI šablona", gradientové plochy navíc (povolen je jen
  gradient loga/karty a jedno jemné radiální světlo v hero).
- Linkovaný papír, krémové pozadí, tyrkysová (to byly starší směry).
- Emoji v UI, ikony jiné než Lucide, víc než jedna hlavní akce na obrazovce.
- Animace, která jen zdobí a nic neříká.

## 10. Kontrola obrazovky

Před commitem UI projdi `references/checklist.md`.
