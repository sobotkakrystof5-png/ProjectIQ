# ZakazIQ — handoff redesignu Landing a Workspace

**Datum:** 2026-10-17  
**Stav (aktualizováno 2026-10-17):** Landing příběh poptávky, kapitoly zákaznice a peněz a `TodayBoard` na Dnes jsou v kódu (commit `06d7b3f`, přeneseno na `ws/s18`); Kalendář má pruh Příchozí; detail je od 1280 px zadokovaný vedle obsahu a otevřený blok je v mřížce zvýrazněný. Zbývá průchod s přihlášením (skutečná data, Poptávky/Zakázky s panelem) a případné doladění podle něj. Aktuální stav vždy v `memory/memory.md`.  
**Rozhodnutí:** R-057 v `memory/memory.md`.

## Zadání pro navazující chat

Pokračujte implementací redesignu skutečného projektu ZakazIQ v tomto repozitáři. Kryštof schválil kombinaci směrů 1, 2 a 3 z předchozího návrhu. Cílem je nadčasový, důvěryhodný a snadno ovladatelný rezervační systém s výraznou UI/UX hierarchií. Nejde o další samostatný HTML prototyp ani o změnu backendu.

Před prvním zásahem projděte aktuální `git status`, větev, `memory/index.md`, `memory/memory.md`, `memory/pravidla.md`, `docs/AGENTS-REFERENCE.md` B8–B11, `docs/landing/PROJECT-BRIEF.md`, `docs/workspace/PLAN.md` a skilly `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `zakaziq-memory`. Ověřte, zda se stav větve od níže uvedeného snímku nezměnil. Zachovejte všechny cizí změny a nepřepisujte rozpracovanou práci.

## Co Kryštof schválil

### Kombinace směrů 1, 2 a 3

1. **Kalendář jako hlavní produktová plocha.** Landing má hned ukázat reálný pracovní kontext kalendáře. Ve Workspace má kalendář dostat jasnou vizuální prioritu; poptávky a detail musí zůstat rychle po ruce v panelech. Zachovejte stávající pravidla aplikace: jedna hlavní akce, detail v pravém panelu, krátká cesta k běžným úkonům a ovládání jednou rukou.
2. **Jedna poptávka, celý příběh na Landing.** Návštěvník sleduje jeden věrohodný ukázkový případ od přijetí přes potvrzení termínu až po zákazníka a související přehled. Kroky půjdou ovládat scrollováním i kliknutím. Z aplikace nedělejte příběhový web; tam zůstává pracovní rozhraní.
3. **Produktové kapitoly.** Landing dostane několik výrazných scén s dostatkem prostoru a odlišnou kompozicí, zejména kalendář, zákazníka a peníze. Každá scéna musí ukázat podstatnou funkci produktu. Apple je inspirace v rytmu a produktové prezentaci, ne podklad ke kopírování.

Tyto tři body se mají propojit: příběh jedné poptávky vysvětlí, jak kalendář, zákazník a přehled souvisejí; jednotlivé kapitoly přitom zůstanou srozumitelné a ovladatelné samostatně.

### Značka a vizuální reference

- Zachovat barvy, logo, typografii a motiv Dílků. Kryštof chce měnit kompozici a hierarchii; barvy a vizuální identitu má vlastní. Nepřinášet novou paletu ani nové dekorativní ilustrace.
- Repilot, Honey App a Apple CZ jsou pouze inspirační reference pro rozvržení, práci s produktem, rytmus a prezentaci. Nekopírovat jejich barvy, vizuální styl, značku ani konkrétní prvky.
- Zachovat systém **Dílky** z `.agents/skills/zakaziq-design-dilky/SKILL.md` a tokeny v `app/ws-tokens.css`. Používat Instrument Sans, Instrument Serif Italic jen jako střídmý nadpisový akcent a JetBrains Mono pro časy, částky a data. Bez barev natvrdo, výchozího šedého shadcn vzhledu, nových gradientů, glassmorphismu, 3D či stock fotografií.
- Výsledek nesmí působit jako obecná AI SaaS šablona: nevršit stejné karty, nepoužít obvyklé trojice ikon, nesázet každou sekci do stejné mřížky a nepřidávat technické dekorace bez funkčního významu.

## Schválené chování ukázek a pohybu

- Jedna hlavní ukázková poptávka propojí části Landing: nová poptávka se objeví jako čárkovaný blok, otevře se detail, uživatel ji potvrdí, blok se přemění na potvrzený termín a příběh naváže zákazníkem a přehledem příjmů.
- Kroky na Landing půjde ručně přepnout i projít scrollováním. **Ukázky se samy opakovaně nepřehrávají.** Scroll se nesmí návštěvníkovi vzít ani přesměrovávat.
- Ukázková data musí být označena „Ukázka“. Nevkládat smyšlené reference, zákaznická loga, recenze, počty uživatelů, procenta úspor ani nové produktové sliby.
- Pohyb má vysvětlovat změnu stavu nebo vést pozornost. Poptávka → potvrzený termín má krátký přechod; v aplikaci se animují změny stavu, nikoli běžný obsah. Vždy respektovat `prefers-reduced-motion`, ovládání klávesnicí a viditelný focus.
- Směr 4 (přepínání oborů) a směr 5 (pracovní nástroj jako samostatná estetická koncepce) nebyly vybrány. Nejsou zamítnuté navždy, ale nejsou součástí schváleného redesignu. Existující ⌘K a situační akce lze ukázat tam, kde pomáhají, bez změny rozsahu produktu.

## Co zůstává závazné a mimo rozsah redesignu

- `docs/landing/PROJECT-BRIEF.md` dál určuje pravdivý obsah, cenu, registraci, CTA, právní placeholdery, kontakt, SEO a pořadí informací, pokud nový směr výslovně neřeší kompozici nebo prezentaci. Cena zůstává 249 Kč měsíčně a 14 dní zdarma podle existujících rozhodnutí. Marketingové texty se řídí běžnou češtinou, oslovením „vy“ a pravidly `zakaziq-ux-texty-cs`.
- Smyslem redesignu je lépe ukázat existující propojení funkcí, ne přidat nové funkce nebo měnit jejich pravidla, databázi, API, platby, onboarding či dostupnost modulů. Nefunkční akce se dál nezobrazují.
- Aplikace má zůstat přístupná i lidem bez technických znalostí. „Více tech prvků“ znamená přesvědčivější demonstraci práce s daty, stavů, propojených kroků a skutečných klávesových akcí; ne terminálovou estetiku nebo technický žargon.
- Směr 2 výslovně nahrazuje automatické opakování příběhových ukázek popsané ve starší části briefu. Ostatní fakta, právní a obsahová rozhodnutí briefu se tím nemění.
- Předchozí samostatný HTML prototyp byl vytvořen mimo repozitář, ale Kryštof ho nedokázal otevřít. Jeho vizuální výstup proto nebyl schválen a další chat z něj nesmí vyvozovat potvrzené detaily. Aktuální zadání je pokračovat v projektu.

## Aktuální podoba projektu, kterou ověřit před úpravami

- Landing je na `/`, v `app/(marketing)/page.tsx`; sekce skládají komponenty `components/marketing/`: `hero`, `live-demo`, `why-bother`, `features`, `how-it-works`, `modules`, `connect`, `pricing`, `faq`, hlavička a footer. Obsah a stávající omezení jsou v `docs/landing/PROJECT-BRIEF.md`. S05 technické SEO je hotové (R-055); texty se kvůli klíčovým slovům nemění.
- Workspace je pod `/w/[business]`. Vstupní stránka `/w/[business]` je Dnes: na široké obrazovce už kombinuje příchozí, týdenní kalendář a kartu zákazníka; detail se otevírá v pravém panelu přes `?detail=`. Samostatný kalendář je `/w/[business]/kalendar` s denním, týdenním a měsíčním pohledem. Kalendář a potvrzování poptávek už fungují; redesign má nejprve zlepšit kompozici a prioritu, ne přepsat pracovní logiku.
- K orientaci v Workspace: `components/ws/app/app-frame.tsx`, `components/ws/app/today/`, `components/ws/app/calendar/`, `components/ws/app/detail-sheet.tsx`, `components/ws/app/detail-slot.tsx`, `components/ws/app/booking/request-actions.tsx`, `app/w/[business]/page.tsx` a `app/w/[business]/kalendar/page.tsx`. Ověřte jejich aktuální stav před rozhodnutím, co upravit.
- Závazné zásady: `docs/AGENTS-REFERENCE.md` B8–B11, `docs/workspace/PLAN.md`, `docs/landing/PROJECT-BRIEF.md`, designový checklist a pohyb ve `zakaziq-design-dilky/references/`. Na telefonu zachovat denní/listový kalendář, velké plochy a spodní navigaci.

## Bezpečný postup navazující implementace

1. Zkontrolovat čistý/dirty stav, větev, poslední commity a současné komponenty. Snímek tohoto sezení: větev `ws/s18` se značným množstvím neuložených změn v bezpečnosti, webhookách, penězích, nastavení, migraci 080, balíčcích a paměti. Tyto změny nejsou redesign a nesmí se vracet, přepisovat ani zahrnout do commitu. Pro Workspace/landing dodržet pravidla větve `workspace` nebo odpovídajícího worktree dle `AGENTS.md`; před přechodem ověřit, že se tím neohrozí dirty work.
2. Prohlédnout současný design Landing i Workspace a pojmenovat konkrétní nedostatky proti schváleným třem směrům. Zachovat funkční obsah a systém Dílků. Když stávající řešení už některý bod naplňuje, nevytvářet druhou paralelní komponentu.
3. Implementovat po ucelených částech: nejdřív scénu Landing s kalendářem a navazujícími ručně ovladatelnými kroky jedné poptávky; poté odlišné kapitoly zákazníka a peněz; následně kalendářovou prioritu Workspace a pravý panel detailu. Neměnit backendové chování.
4. Kontrolovat šířky 390, 768, 1280 a 1440 px, klávesnici, `prefers-reduced-motion`, kontrast a tmavý režim Workspace. Vypnutý pohyb nesmí skrýt obsah. Ověření provést podle aktuálních požadavků B12; nic nevydávat za ověřené bez skutečného běhu.
5. Aktualizovat brief jen v částech, které se skutečně změní (zejména pořadí/kompozice a pohyb), zapsat rozhodnutí a changelog do `memory/`, přidat nové dokumenty do indexu. Neprovádět deploy ani produkční zásahy bez samostatného výslovného souhlasu.

## Přímo vložitelný startovací pokyn pro další chat

> Pokračuj v redesignu ZakazIQ podle `docs/REDESIGN-HANDOFF.md` a rozhodnutí R-057. Kryštof schválil kombinaci: (1) kalendář jako hlavní produktová plocha, (2) jedna poptávka propojená na Landing od přijetí po potvrzení, zákazníka a peníze, (3) výrazné produktové kapitoly. Zachovej Dílky, barvy, logo a stávající vizuální identitu; inspirace Repilot/Honey/Apple se týká pouze layoutu a prezentace produktu. Landing ukázky musí být ovladatelné scrollováním i kliknutím a nesmí se samy opakovaně přehrávat. Směr 4 a 5 nebyly vybrány. Nezměň fakta, cenu, backend, API ani chování funkcí. Před prací načti povinné projektové dokumenty a skilly, zkontroluj aktuální větev a dirty work; zachovej veškeré existující neuložené změny. Nejprve prohlédni současný kód a navrhni konkrétní první implementační krok, pak pokračuj bez zbytečných doplňujících otázek.
