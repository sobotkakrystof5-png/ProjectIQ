# Klientský prostor, hlášení práce a nový admin — plán

> Stav: **rozpracováno** (2026-11-01). Kryštof zadal implementaci všech kroků, tím jsem přijal doporučení u D-K1–D-K11 (zapsáno jako R-070, `memory/memory.md`). Implementováno KP00 (zápis rozhodnutí), KP01–KP07 a KP09 úroveň 2 v kódu na větvi `ws/redesign-app`; migrace 092–096 aplikované na produkci (2026-11-01), **nic neověřeno v prohlížeči**, KP08 odloženo, KP10 rozpracováno (DPA a rezidence AI zpracovatelů ověřeny, sekce 8.1). Prompty sezení jsou v `new - area of zakaziq/prompty/klientsky-prostor/` (rozcestník `00-README.md`).
>
> **Druhá vlna (2026-11-18, R-121):** pozvání jedním klikem s heslem, které si klient nastaví sám, etapy ze šablony podle druhu služby, peníze a faktury v prostoru, konzultace jen ve volnu, které Kryštof označí v kalendáři, a chat s klientem jako přes WhatsApp pro veškerou zpětnou vazbu (R-122). Celý prostor je rozvržený jako Slack, jen jednodušší, s přečtenými a nepřečtenými zprávami jako ve WhatsAppu (R-123). Architektura v 4.7, sezení KP11–KP17 v 6, rozhodnutí D-K12–D-K19 v 7. Přihlášení e-mailem a heslem (Supabase, R-107 F1) je hotové v kódu na větvi `auth/supabase-klient`, nesloučené.

## 1. Co chceme

Kryštofovými slovy, upřesněno po rozboru:

1. **Klient má vlastní prostor.** Přihlásí se ke svému projektu a vidí dashboard: co se udělalo, v jaké je projekt fázi, co čeká na něj. Kryštof mu nic neposílá ručně, systém posílá sám.
2. **Práce se hlásí sama.** Projekt, na kterém Kryštof pracuje v Claude Code, je napojený na systém zakázek. Co se udělalo, se objeví klientovi jako srozumitelná zpráva, bez psaní reportu.
3. **Klient může psát a mluvit.** Když se Kryštofovi nedovolá, napíše nebo nadiktuje, co chce změnit. AI z toho udělá shrnutí a zadání pro Claude Code. Kryštof ho po návratu zkontroluje a vloží do projektu.
4. **Bezpečnost má přednost.** Každý klient vidí jen svoje, každý projekt má vlastní klíč, nic cizího nespustí práci samo.
5. **Admin je škaredý a roztříštěný.** Kryštof chce stejně čistý vzhled a strukturu, jako má nová aplikace pro klienty (Dílky), a lepší propojení VIZEON, zakázek a klientských prostorů.
6. **Jednodušší hodnocení.** Dnes Kryštof posílá odkaz nebo QR kód na hodnocení. Nově se hodnocení nabídne klientovi samo ve chvíli, kdy je projekt hotový.

Jedno pravidlo nade vším: **cokoli, co přijde zvenku (text klienta, nahrávka, zpráva z Claude Code), je koncept nebo požadavek ke schválení. Nic se nevykoná ani nepublikuje samo, dokud to člověk nepotvrdí.** Výjimky se dělají až po důvěře a jen vědomě (D-K5, D-K7).

## 2. Stav k 2026-11-01

**Hotovo (první krok, R-069 po schválení, kód na větvi `ws/redesign-app`):**
- Klient na `/p/[token]` napíše nebo nadiktuje požadavek (OpenAI přepis, audio se neukládá), AI udělá shrnutí a zadání, admin je vidí v `/dashboard/pozadavky`, přijde zvonek a e-mail. Migrace 092 připravená, **neaplikovaná**; chybí `OPENAI_API_KEY`; neověřeno v prohlížeči.

**Co v kódu je a plán na tom staví:**
- Admin (`app/dashboard`, `app/alteno`, `app/hub`): horní lišta s 13 odkazy, tři vzhledy, NextAuth s jedním adminem, `lib/db.ts` (Neon, vlastník tabulek, bez RLS).
- Zakázky `public.projects` (`status`, `progress`, `deadline`, `project_url`, `public_token`, `business`), `progress_updates` (ruční historie postupu), `client_messages` (vzkazy klientovi), `client_feedback` (NPS), `consultation_slots`.
- Portál `/p/[token]`: jen čtení + hodnocení + rezervace + nově požadavky. Token v URL je jediná ochrana.
- Hodnocení po dokončení: `/h/[token]` (dotazník, `completed_projects.survey_token`) a odkaz/QR posílá Kryštof ručně.
- Workspace (SaaS): Clerk jen pod `/w`, schéma `ws` s RLS a rolí `ws_app`, hashované klíče napojení (`lib/ws/keys.ts`, HMAC s pepřem), generování promptu pro Claude Code (`lib/ws/intake/claude-prompt.ts`), admin nad Workspace (`/dashboard/klienti`).
- Dílky: design systém, komponenty `components/ws/app/` (PageShell, PageHeader, Toolbar, PillNav, EmptyState), tokeny jen v `[data-app="ws"]` (R-027).
- Clerk je jen dev instance, produkční instance chybí; Stripe live, ověřený Resend a právní texty také chybí (blokují spuštění Workspace, ne tenhle plán).

**Co neexistuje:** tabulka klientů (zakázka má jen `client_name`/`client_email`), přihlášení klientů, aktivita projektu psaná systémem, jakékoli napojení Claude Code na systém, soubory od klientů.

## 3. Čtyři toky

```
        ┌──────────────── 1. HLÁŠENÍ (Claude Code → klient) ────────────────┐
Claude Code u Kryštofa ──► koncept hlášení ──► Kryštof schválí (1 klik) ──► klient vidí aktivitu
        (klíč jen pro zápis                    (po důvěře: automaticky)
         do jednoho projektu)

        ┌──────────────── 2. POŽADAVEK (klient → Kryštof) ──────────────────┐
Klient napíše / nadiktuje ──► AI shrnutí + zadání ──► inbox + zvonek + e-mail ──► Kryštof vloží do Claude Code

        ┌──────────────── 3. PŘEHLED (systém → klient) ─────────────────────┐
Změna stavu / schválená aktivita / zpráva ──► klientský prostor + automatický e-mail

        ┌──────────────── 4. HODNOCENÍ (systém → klient) ───────────────────┐
Stav „Hotovo“ ──► karta hodnocení v prostoru + e-mail (po několika dnech) ──► NPS a reference
```

Tok 2 je hotový v první verzi. Tok 1 a 3 jsou jádro plánu. Tok 4 nahradí ruční odkazy.

## 4. Architektura

### 4.1 Oddělení dat: schéma `portal` a role bez přístupu do `public`

Admin konzole používá `lib/db.ts` s vlastníkem tabulek bez RLS. Kdyby klientský prostor četl `public.projects` stejným spojením, jediná chyba ve filtru by ukázala cizí zakázku (včetně interních poznámek a ceny). Proto stejný model jako u Workspace (R-035):

- Nové schéma **`portal`** a role **`portal_app`**. Role **nemá žádná práva na schéma `public`**.
- V `portal` jsou jen věci, které smí klient vidět: `portal.clients` (firma), `portal.members` (přihlášení lidé), `portal.invites` (pozvánky), `portal.projects` (**projekce**: jméno, stav, fáze, termín, odkaz na živou verzi), `portal.activity` (jen schválené zprávy), `portal.messages` (zprávy mezi klientem a Kryštofem), `portal.requests` (požadavky od klienta).
- **Přes hranici jde jen schválené.** Databázové triggery (`SECURITY DEFINER`, vlastník) zkopírují do `portal.projects` jen vybrané sloupce zakázky a do `portal.activity` jen zprávy se stavem `published`. `notes`, `price`, `client_email` ani koncepty se do `portal` nikdy nedostanou. Admin kód se nemění: trigger visí na tabulkách, ne v akcích.
- Každá tabulka v `portal` má RLS podle `portal.current_client()` (nastavuje se v transakci jako `app.client_id`), složené cizí klíče `(client_id, id)`, test oddělení klientů v PGlite jako u `ws` (R-036).
- Migrace připravuji, **aplikuje je Kryštof**. Role se zakládá skriptem, nikdy v konzoli Neonu.

*Lehčí varianta (D-K1b):* izolace jen v kódu (`requireClient()` + filtr). Je to o týden rychlejší a nechrání proti jedné zapomenuté podmínce. Nedoporučuji.

### 4.2 Přihlášení klienta: pozvánka a Clerk, ne trvalý klíč

Kryštof popisuje „klíč, který mu pošlu, zaregistruje se a pak ho používá vždycky“. Trvalý sdílený klíč jako heslo má tři slabiny: přeposílá se, nejde odvolat po jednotlivých lidech a kdo ho má, je tam. Proto:

1. Admin vytvoří **pozvánku** (jednorázový kód, v DB jen hash, platí 14 dní, jde zneplatnit).
2. Klient otevře `/klient/pozvanka/<kód>`, zaregistruje se přes **Clerk** (e-mailový kód nebo passkey, žádné heslo od nás) a kód se tím spotřebuje.
3. Dál se jen přihlašuje. Admin vidí členy a může každého odebrat.

Clerk už projekt má a produkční instanci je tak jako tak potřeba založit pro Workspace; klientský prostor využije stejnou instanci. Bez Clerku (vlastní e-mailové kódy) by si Kryštof nesl vlastní autentizaci, což je horší. Rozšíření Clerku mimo `/w` mění `proxy.ts` a CSP, zapíše se do `.claude/security/` (R-037 se tím upřesní).

### 4.3 Hlášení z Claude Code

- **Klíč na projekt:** `project_agent_keys` v `public`, HMAC s pepřem jako u `lib/ws/keys.ts`, ukáže se jednou, jde otočit a zneplatnit. Klíč **umí jen zapsat koncept hlášení do jednoho projektu**. Nic nečte, nic nemění, nic nepublikuje.
- **Endpoint:** `POST /api/agent/v1/projects/{id}/reports` s `Authorization: Bearer`, Zod, limity délky, rate limit na klíč, CORS není (volá se ze serveru/terminálu).
- **Co se posílá:** text napsaný pro laika (co se udělalo, proč, co dál), nikdy surový diff, log ani výpis příkazů. Server navíc **zakrývá podezřelé řetězce** (klíče `sk-…`, `Bearer …`, connection stringy, `.env` řádky, cesty v domovské složce) a označí koncept „obsahuje citlivé“, takže ho nejde schválit jedním klikem.
- **Strana Claude Code:** (a) pravidlo v `CLAUDE.md` projektu klienta „na konci práce zavolej `zakaziq-report`“, (b) malý skript bez závislostí (`scripts/zakaziq-report.mjs`, jen odesílá, nic nestahuje ani nespouští), (c) volitelně hook `Stop`/`SessionEnd` jako pojistka, že se na hlášení nezapomnělo (hooky umí volat příkaz i HTTP, přesná pole se ověří při implementaci). Skill `zakaziq-hlaseni` a krátký návod pro nový projekt.
- **Schvalování:** koncept → Kryštof upraví a schválí → `published` → trigger ho přenese do `portal.activity` → klient vidí a dostane souhrnný e-mail (ne e-mail na každé hlášení). Po důvěře jde per projekt zapnout automatické publikování (D-K5), vždy po kontrole citlivých řetězců.

### 4.4 Požadavky klienta (tok 2)

První verze je hotová na `/p`. V klientském prostoru (KP07) se přesune pod přihlášení, přidá historii („co jsem poslal, v jakém je to stavu“) a zprávy tam a zpět. `/p/[token]` zůstává jako záložní čtení, dokud ho Kryštof nevypne projekt po projektu (D-K2).

### 4.5 Předání do Claude Code (tok 2, druhá půlka)

Tři úrovně, každá vyšší vyžaduje samostatné rozhodnutí (D-K7):

| Úroveň | Co dělá | Stav |
|---|---|---|
| 1. Kopírovat zadání | Kryštof zadání zkontroluje a vloží ručně | hotovo |
| 2. Příkaz do terminálu | tlačítko vygeneruje příkaz, který otevře Claude Code v repu projektu se zadáním | KP09, nízké riziko |
| 3. Cloud | Routines API spustí Claude Code v cloudu nad repozitářem a výsledek je větev nebo PR ke schválení | KP09, jen po experimentu |

Poznámky: *Channels* (událost do běžící lokální session) jsou research preview, session musí běžet a bez příznaku `--channels` se události tiše zahodí. *Routines API* je experimentální, běží v cloudu Anthropic nad repozitářem (ne na Kryštofově počítači), limit 30 spuštění za hodinu na rutinu a 100 za hodinu na účet, každé volání vytvoří novou session bez idempotence ([docs](https://platform.claude.com/docs/en/api/claude-code/routines-fire), [channels](https://code.claude.com/docs/en/channels-reference)). **Plně automatické spuštění z cizího textu se nedělá** (injekce do agenta s právy na počítači); u úrovně 3 vždy jen do větve a nikdy rovnou do produkce.

### 4.6 Nový admin

Dnes: 13 odkazů v jedné liště, tři vzhledy (VIZEON modrá, ALTENO oranžová, Hub), žádný přehled „co je teď potřeba“. Navrhovaná struktura:

| Skupina | Obsah |
|---|---|
| **Dnes** (nová úvodní) | požadavky klientů čekající na vás, hlášení ke schválení, faktury po splatnosti, nejbližší konzultace a hovory, zakázky bez pohybu |
| **Zakázky** | VIZEON a ALTENO v jednom seznamu s přepínačem, stav, fáze, termín; **detail zakázky jako centrum** se záložkami Přehled · Aktivita · Požadavky · Zprávy · Soubory · Fakturace |
| **Kalendář a Hovory** | beze změny funkcí, nový vzhled |
| **Peníze** | Faktury, Náklady, odkaz do Hub › Finance |
| **Klienti** | klientské prostory (pozvánky, členové) a Workspace klienti, Novinky |
| **Hub** | osobní moduly zůstávají samostatně, jen odkaz |

Technicky: nový společný layout na Dílky (boční menu na počítači, spodní lišta a šuplík na telefonu, hledání ⌘K, pravý panel pro detail) postavený na `components/ui` a sdílených primitivech `components/ws/app`. Staré stránky zůstávají funkční a přebírají vzhled jedna po druhé (strangler), staré adresy se nemění. **Tohle mění R-027 (admin si nechává svůj vzhled)** a potřebuje nové rozhodnutí; zadání Kryštofa „zlepšit i admina“ platí jako výslovné povolení sahat na admin v sezeních KP01–KP04, KP06, KP10.

### 4.7 Druhá vlna (R-121): pozvání, etapy, peníze, konzultace

Zásada z 4.1 platí dál: `portal_app` nemá práva do `public`, do `portal` se dostává jen to, co má klient vidět, a to přes triggery nebo úzké `SECURITY DEFINER` funkce. Interní údaje (poznámky, linie přiznané/nepřiznané `invoiced_on_ico`, `finance_transactions`, koncepty faktur, AI přepisy) do `portal` nikdy.

**Pozvání jedním klikem (KP11).** V detailu zakázky tlačítko „Pozvat klienta do prostoru": najde existujícího klienta podle e-mailu člena, jinak založí `portal.clients`, propojí zakázku (`portal.link_project`), vytvoří pozvánku vázanou na e-mail (F1, migrace 113) a pošle ji z krystof@vizeon.cz přes Resend (`sendVizeonMail`, R-116). Heslo si klient nastaví sám a nikdo jiný ho nezná. Pozvánku nejde poslat na `ADMIN_EMAIL`. Kdo už v prostoru je, dostane jen e-mail o nové zakázce. Asistent smí pozvání připravit, odeslání je „jedno klepnutí" (R-111).

**Služby a etapy (KP12).** `projects.service_type` je dnes volný text. Nově číselník služeb a ke každé šablona etap: název, popis pro klienta, typická délka ve dnech, úkoly pro klienta (dodat texty, fotky, přístupy, schválit návrh). **Obsah šablon píše Kryštof** v Nastavení, agent nic nevymýšlí; prázdné šablony Web, E-shop, Design, Automatizace jsou jen návrh k potvrzení. Při založení zakázky se etapy **zkopírují** do zakázky (kopie, ne odkaz, aby úprava šablony nepřepsala běžící zakázky) a termíny se předvyplní od data zahájení; Kryštof je upraví. Do `portal` jde projekce triggerem (název, popis, termín, stav, úkoly). Klient smí jen označit svůj úkol „Mám hotovo" funkcí `portal.submit_*` (členství, limit), Kryštofovi přijde zvonek. Hesla a přístupy se tudy neposílají, říká to text u úkolu.

**Peníze (KP13).** Klient vidí u svých zakázek cenu, zaplaceno (záloha, ruční zálohy, platby faktur), zbývá doplatit a faktury. Výpočet je tentýž jako v adminu (`lib/admin/project-payments.ts`, R-110), měny se nesčítají. Faktury: vystavené (`number_seq IS NOT NULL`) a archivní navázané na zakázku, stav zaplaceno / čeká / po splatnosti / stornováno; koncepty (R-117) nikdy. Projekce do `portal` triggerem se snímkem položek, dodavatele, odběratele a splatnosti. PDF pro klienta se vyrábí z projekce stejným `lib/invoice-pdf/render.ts`, takže kód `/klient` nepotřebuje spojení vlastníka; archivní PDF (`pdf_data`) rozhodne KP13 s `web-security-review`. QR platba jen u nezaplacené faktury v CZK s IBANem. Online platba se nedělá.

**Konzultace z volna (KP14).** Kryštof v kalendáři adminu označí **Volno pro klienty**. Je to **vlastní tabulka, ne `calendar_events`**: překryvový guard z migrací 008 a 044 bere každou událost jako obsazený čas, takže by volno kolidovalo s rezervací uvnitř sebe. Klient vidí sloty = volno − události kalendáře − konzultace − plánované hovory, po délce konzultace (D-K13). Rezervace jde úzkou funkcí (členství, limit, kolize atomicky v DB, R-005), založí `consultation_slots`, kalendářní událost a zrcadlo v Hovorech (R-096); pak Google Meet a e-maily přes `lib/admin/meetings.ts` (R-114). Jak to spustit bez spojení vlastníka v kódu `/klient`, rozhodne KP14 s `web-security-review`; selhání Meetu nesmí rezervaci zrušit. Pevné hodiny `getHourSlots` (všední dny 14–20, víkend 8–22) na `/p` nahradí stejné volno.

**Chat s klientem (KP15, R-122).** Jedno vlákno na zakázku, kde klient dává veškerou zpětnou vazbu (web, návrh, co upravit a co ne) a Kryštof odpovídá, jako přes WhatsApp. Staví na `portal.messages` z migrace 096 (klient i admin, limit 20 zpráv za hodinu) a `replyToClient` v `app/portal-admin-actions.ts`. Dnes chybí: (a) **schránka v adminu** přes všechny klienty s nepřečtenými, s odpovědí i z telefonu (dnes jen panel v detailu zakázky); (b) **živé obnovení** dotazováním po 10 s s ETagem jako ve Workspace (R-044), žádný WebSocket; (c) **přečteno** u obou stran; (d) **upozornění**: když druhá strana nemá chat právě otevřený (poslední obnovení starší než minuta), odejde jí e-mail hned, nejvýš jednou za hodinu na vlákno; klientovi z krystof@vizeon.cz s odkazem rovnou do chatu, Kryštofovi navíc zvonek (už je). Čekat „15 minut, jestli si to přečte" Vercel Hobby neumí (cron 1× denně, R-006); (e) **hlasová zpráva** stejnou cestou jako požadavek (přepis, audio se neukládá, R-069); (f) **obrázky a PDF** (screenshoty návrhu), viz D-K18; (g) **odpověď na konkrétní zprávu** a odkaz na etapu, ke které se zpětná vazba vztahuje; (h) **„Ke schválení"**: Kryštof pošle návrh nebo odkaz a klient klikne „Schvaluji" nebo „Chci změny", schválení splní úkol etapy z KP12; (i) **„Udělat z toho zadání"** u jedné nebo víc zpráv v adminu: stávající AI shrnutí a prompt pro Claude Code (R-069), Kryštof ho zkontroluje a vloží sám, nic se nespustí samo. Text klienta se nikdy nevykresluje jako HTML, odkazy jen jako text nebo s `rel="noopener noreferrer nofollow"`. Retence podle R-076 (zprávy už v ní jsou), přílohy musí přibýt.

**Rozvržení jako Slack, jen jednodušší (R-123).** Celý klientský prostor je jedna aplikace se třemi sloupci; vzhled podle Dílků, ne podle Slacku. Vlevo firma klienta, Přehled, **zakázky jako kanály** (řazené podle poslední zprávy, nepřečtené tučně s počtem v tónu `signal`), Faktury a Konzultace. Uprostřed chat zakázky, nahoře její název a etapa. Vpravo panel **O zakázce**: etapa a termín, co čeká na klienta, zaplaceno a zbývá, nejbližší konzultace a „Domluvit konzultaci"; pod 1280 px se otevírá tlačítkem. Na telefonu jako WhatsApp: seznam zakázek s poslední zprávou, časem a počtem nepřečtených → chat přes celou obrazovku → detail ze záhlaví; dole lišta Zprávy, Přehled, Faktury, Konzultace. Schránka **Zprávy v adminu** má stejné rozvržení: vlevo konverzace všech klientů, uprostřed chat, vpravo klient a zakázka s akcemi („Udělat z toho zadání", „Ke schválení", „Otevřít zakázku").

```
┌────────────────┬────────────────────────────────┬──────────────────────┐
│ Kavárna Novák  │ Web pro kavárnu     Vývoj 2/4  │ O zakázce            │
│                │────────────────────────────────│ Vývoj · do 12. 12.   │
│ Přehled        │ ─────── Nové zprávy ───────    │ Na tahu jste vy:     │
│                │ Kryštof: Posílám návrh menu    │   dodat fotky        │
│ ZAKÁZKY        │   [Ke schválení]               │ Zaplaceno 12 000 Kč  │
│ ▪ Web       3  │   Schvaluji | Chci změny       │ Zbývá 8 000 Kč       │
│   E-shop       │          Vy: Logo menší  ✓✓    │ Konzultace čt 14:00  │
│                │                                │ [Domluvit konzultaci]│
│ Faktury        │ ┌────────────────────────────┐ │                      │
│ Konzultace     │ │ Napište zprávu…  mic  +  > │ │                      │
│ Jan Novák      │ └────────────────────────────┘ │                      │
└────────────────┴────────────────────────────────┴──────────────────────┘
```

**Přečtené a nepřečtené jako ve WhatsAppu a Messengeru.** U vlastní zprávy jedna fajfka = odesláno, dvě plné = přečteno; po klepnutí „Přečteno 14:32 · Jan Novák". Krok „doručeno" není, protože web nemá zařízení, kam by se doručovalo. Nepřečtené: tučná zakázka s počtem v levém sloupci, čára „Nové zprávy" ve vlákně, počet v titulku karty. Pamatuje se poslední přečtení každé strany ve vlákně; u klienta s více členy stačí, když si zprávu přečte kterýkoli z nich, a Kryštof vidí kdo. Kdo co vidí o aktivitě druhé strany, řeší D-K19.

**Co ze Slacku záměrně není:** vlákna v odpovědích (stačí citace zprávy), reakce, vlastní kanály, přímé zprávy mezi členy klienta, „píše…", hovory, stavy a sdílení obrazovky. Jeden kanál = jedna zakázka = klient a Kryštof.

**Přehled klienta (KP16).** Položka Přehled v levém sloupci a obsah pravého panelu. Začíná tím, co čeká na klienta (úkol z etapy, schválení návrhu, faktura po splatnosti, hodnocení) a nepřečtenými zprávami, pak aktuální etapa s termínem, nejbližší konzultace, peníze a poslední aktivita. Faktury a Konzultace v levém sloupci jsou souhrn přes všechny zakázky klienta. Hodnocení přejde na dotazník R-119 (dnes `/klient` nabízí starou `FeedbackCard`). Při přechodu etapy souhrnný e-mail nejvýš 1× za 24 h jako u aktivity (R-072).

**Analýza (KP17, D-K16 rozhodnuto 2026-11-20).** Klient uvidí **poptávky ze svého webu**: kolik lidí
napsalo nebo se objednalo přes jeho web, po měsících (v Přehledu u zakázky webu). Návštěvnost webu se
teď nedělá; kolik práce a peněz projekt stál, už ukazují KP13 a KP16. **Pozor na napojení:** dnešní
příjem `lib/web-leads.ts` (AD02, R-088) zakládá z každé poptávky nepotvrzenou zakázku v Kryštofově
schránce Poptávky — weby klientů se na něj napojit nesmí, jinak by zákazníci klienta skončili v adminu
jako Kryštofovy poptávky. `lib/lead-origins.ts` zná jen Kryštofovy weby (vizeon.cz, alteno.cz,
prvotka.cz) a jeden zdroj bez domény; z webů klientů dnes nechodí nic. Jak se poptávky z webu klienta
do ZakazIQ dostanou, rozhodlo **D-K20 (2026-11-20): jen počet** — server webu klienta po odeslání
formuláře pošle s klíčem zakázky událost „poptávka" nebo „objednávka" bez jména, kontaktu a textu;
poptávka sama jde klientovi e-mailem jako dnes.

## 5. Bezpečnostní model

| Hrozba | Opatření | Kde |
|---|---|---|
| Klient vidí cizí projekt | schéma `portal`, role bez práv do `public`, RLS, složené klíče, test oddělení | KP05 |
| Únik agentského klíče | klíč jen pro zápis konceptu do jednoho projektu, HMAC v DB, rotace, rate limit | KP04 |
| Citlivé údaje v hlášení (klíče, `.env`, cesty) | zakrývání na serveru, příznak „citlivé“, koncept se schvaluje člověkem, nikdy surový diff | KP03, KP04 |
| Prompt injection v textu nebo nahrávce klienta | text jen jako data v citaci, AI jen shrnuje, žádné automatické spuštění, člověk čte | hotovo, KP09 |
| Pozvánka přeposlaná dál | jednorázová, vyprší, hash v DB, odebrání člena, volitelná vazba na e-mail | KP05 |
| Zneužití nákladů (OpenAI, Claude) | limity po IP a po projektu, strop velikosti, počítání i neúspěšných volání | hotovo, KP07 |
| Osobní údaje a nahrávky | audio se neukládá, DPA a evropská rezidence OpenAI k ověření, retence a výmaz | KP10 |
| Token v `/p/[token]` | nahradí přihlášení; po přechodu jde vypnout per projekt | KP06, KP10 |
| Hook nebo skript u Kryštofa | skript jen odesílá, nic nestahuje ani nespouští, verze pevně v repu | KP04 |
| CSP a Clerk mimo `/w` | změna `proxy.ts` a CSP zapsaná v `.claude/security/CSP-LOG.md`, žádné `unsafe-inline` | KP05 |

Každé sezení s veřejným vstupem nebo databází končí `web-security-review`, KP10 `web-security-audit`.

## 6. Fáze a sezení

Jedno sezení = jedna nová konverzace v Claude Code. Velikost: S ≈ půl dne, M ≈ den, L ≈ víc dní práce.

| Sezení | Obsah | Vel. | Migrace | Potřebuje | Dotýká se adminu | Stav |
|---|---|---|---|---|---|---|
| **KP00** | Uzavřít první krok: aplikovat 092, `OPENAI_API_KEY`, ověřit v prohlížeči (Chrome, Safari iOS), rozhodnout větev, zapsat R-070 a rozhodnutí D-K | S | 092 | všechna D-K | ne | částečně: R-070 zapsáno; 092, `OPENAI_API_KEY`, ověření v prohlížeči a AI na skutečných textech čeká na Kryštofa |
| **KP01** | Nový admin: společný layout, navigace, Dílky v adminu, staré stránky se přepnou | L | — | D-K6 | **ano** | kód hotov (R-071), v prohlížeči neověřeno |
| **KP02** | Admin: stránka Dnes a detail zakázky jako centrum se záložkami | L | — | KP01 | **ano** | kód hotov kromě „stav jedním klikem se Zpět“ (viz R-071), neověřeno |
| **KP03** | Aktivita projektu: model, koncepty a schvalování, zobrazení na `/p`, souhrnný e-mail | M | 093 | KP02, D-K5 | **ano** | kód hotov (migrace 093 neaplikovaná), neověřeno |
| **KP04** | Hlášení z Claude Code: klíče projektu, endpoint, zakrývání citlivého, skript, skill, návod | M | 094 | KP03 | **ano** | kód hotov (migrace 094 neaplikovaná), neověřeno |
| **KP05** | Klientský prostor I: schéma `portal`, role, RLS, pozvánky, Clerk přihlášení, správa členů | L | 095+ | D-K1, D-K3, KP02 | částečně | kód hotov (095 neaplikovaná, role neexistuje), přihlášení Clerk neověřeno |
| **KP06** | Klientský prostor II: přehled projektů, detail, aktivita, automatické hodnocení po dokončení | M | — | KP03, KP05 | částečně | kód hotov (přehled, aktivita, hodnocení po dokončení), neověřeno |
| **KP07** | Klientský prostor III: požadavky (text i hlas) a zprávy pod přihlášením, historie | M | 09x | KP05, hotový krok 1 | částečně | kód hotov (096 neaplikovaná), neověřeno |
| **KP08** | Soubory a přílohy (volitelné) | M | 09x | D-K8, KP07 | ne | nezačato (odloženo, D-K8) |
| **KP09** | Předání do Claude Code: úroveň 2, experiment s úrovní 3 | M | — | D-K7, KP07 | ne | úroveň 2 hotova; úroveň 3 se nedělá bez experimentu a rozhodnutí |
| **KP10** | Audit, GDPR, právní texty, pilot s jedním klientem, spuštění | M | — | vše | ano | nezačato; prompt aktualizovaný 2026-11-20 na stav po KP11–KP16 (Supabase místo Clerku, chat, přílohy, Resend, migrace 113 a 121–125) |
| **KP11** | Přihlášení naostro a pozvání jedním klikem: převzít F1 z `auth/supabase-klient`, seznam nastavení Supabase pro Kryštofa, tlačítko „Pozvat klienta do prostoru", průchod v prohlížeči | M | — (113 z F1) | R-107 F1, D-K12 | částečně | kód hotov na větvi `klient/kp11-prihlaseni` (2026-11-18): F1 převzatá, pozvání jedním klikem s potvrzením cizího prostoru; čeká na nastavení Supabase a migraci 113, v prohlížeči jen karta s vymyšlenými daty |
| **KP12** | Služby a etapy: číselník služeb, šablony etap v Nastavení, předvyplnění u nové zakázky, etapy v detailu zakázky, úkoly pro klienta, projekce do `portal` | L | ano | KP11, D-K14 | **ano** | kód hotov 2026-11-18 na větvi `klient/kp12-etapy`: Nastavení › Služby a etapy, výběr služby u nové zakázky, karta Etapy v detailu, osa etap a „Mám hotovo" v `/klient`, postup v % z etap; migrace 121 neaplikovaná, ověřeno v PGlite a na dočasné stránce s vymyšlenými daty |
| **KP13** | Peníze v prostoru: zaplaceno, zbývá, faktury s PDF a QR, projekce do `portal` | M | ano | KP11, D-K15 | částečně | kód hotov 2026-11-18 na větvi `klient/kp13-penize`: sekce Peníze v detailu projektu (cena, zaplaceno, zbývá, faktury se stavem, PDF, QR), `GET /api/klient/faktury/[id]/pdf`, zaplacené faktury nově snižují „zbývá" i v adminu (R-125), archivní PDF úzkou funkcí (DECISIONS #042); migrace 122 neaplikovaná, ověřeno v PGlite a na dočasné stránce s vymyšlenými daty |
| **KP14** | Konzultace z volna: Volno pro klienty v kalendáři adminu, rezervace v prostoru, Google Meet a e-maily, `/p` na stejný zdroj | L | ano | KP11, D-K13 | **ano** | kód hotov 2026-11-20 na větvi `klient/kp14-konzultace`: Volno pro klienty v kalendáři (opakování, smazání dne i řady se Zpět), rezervace, přesun a zrušení v prostoru, Meet, potvrzení z krystof@vizeon.cz a zvonek, `/p` na stejné volno (R-126); migrace 123 neaplikovaná, ověřeno v PGlite a na dočasné stránce s vymyšlenými daty |
| **KP15** | Chat a rozvržení jako Slack: tři sloupce se zakázkami jako kanály, telefon jako WhatsApp, odesláno a přečteno, schránka Zprávy v adminu ve stejném rozvržení, živé obnovení, e-mailová upozornění, hlasové zprávy, obrázky a PDF, „Ke schválení", „Udělat z toho zadání" | L | ano | KP11, D-K17, D-K18, D-K19 | **ano** | kód hotov 2026-11-20 na větvi `klient/kp15-chat`: prostor jako Slack (zakázky jako kanály, Přehled, Faktury, Konzultace, telefon jako WhatsApp), chat s fajfkami, „Nové zprávy", citací, hlasem, obrázky a PDF (Supabase Storage), „Ke schválení", schránka Zprávy v adminu s „Udělat z toho zadání", e-mail 1×/h, Požadavky sloučené do chatu (R-127); migrace 124 neaplikovaná, bucket `chat-prilohy` nezaložený, ověřeno v PGlite a na dočasné stránce s vymyšlenými daty |
| **KP16** | Přehled klienta do rozvržení z KP15: Přehled, panel O zakázce, Faktury a Konzultace v levém sloupci; hodnocení přes dotazník R-119; e-mail při změně etapy | M | — | KP12–KP15 | částečně | kód hotov 2026-11-20 na větvi `klient/kp16-prehled`: „Čeká na vás" a karty zakázek v Přehledu, panel O zakázce s etapami, úkoly, penězi, konzultací a co se dělo (pod 1280 px výsuvný), souhrnné Faktury a Konzultace, po přihlášení chat s nepřečtenou zprávou, hodnocení přes dotazník R-119, e-mail o hotové etapě nejvýš 1× za 24 h, odkaz do prostoru na `/p` (R-128); migrace 125 neaplikovaná, ověřeno v PGlite a na dočasné stránce s vymyšlenými daty |
| **KP17** | Poptávky z webu klienta: napojení webu klienta (podle D-K20), počet poptávek a objednávek po měsících v Přehledu prostoru a v detailu zakázky v adminu | M | ano | KP16, D-K16, D-K20 | **ano** (veřejný vstup) | D-K16 a D-K20 (jen počet) rozhodnuto 2026-11-20; **kód hotov 2026-11-20** na větvi `klient/kp17-poptavky-webu`, migrace 126 neaplikovaná, R-130, návod `NAPOJENI-WEBU-KLIENTA.md` |

Pořadí: KP00 → KP01 → KP02 → KP03 → KP04 jde čistě na adminu a nepotřebuje přihlášení klientů, takže dává užitek hned (Kryštof má hlášení a nový admin, klient je vidí přes stávající `/p`). Teprve KP05 přidá přihlášení. KP08 a KP09 jsou volitelné a jdou prohodit.

Druhá vlna: **KP11 první** (bez přihlášení nemá zbytek smysl), pak KP12, KP13, KP14 a KP15 v libovolném pořadí (sahají na různé části; „Ke schválení" v chatu umí splnit úkol etapy až po KP12, do té doby jen zaznamená odpověď), KP16 až po nich, protože skládá jejich výsledky. KP10 (audit, pilot) až za KP16.

Čísla migrací jsou orientační; sezení vždy vezme **první volné číslo po poslední migraci**.

## 7. Rozhodnutí, která potřebuji od Kryštofa

| # | Otázka | Doporučení | Stav |
|---|---|---|---|
| D-K1 | Kde klient žije: (a) `/klient` s Clerkem a schématem `portal`, (b) jen rozšířit `/p` | (a), izolace schématem a rolí | přijato doporučení (R-070) |
| D-K2 | Co s `/p/[token]` po spuštění přihlášení: nechat, nebo vypínat per projekt | nechat jako čtení, po přechodu klienta vypnout | přijato doporučení (R-070) |
| D-K3 | Kolik lidí za klienta: jeden, nebo víc členů s jedním vlastníkem | víc členů, model počítá s tím od začátku | přijato doporučení (R-070) |
| D-K4 | Platí klient za prostor zvlášť, nebo je součástí zakázky | součást zakázky (zdarma); náklad jsou jen přihlášení v Clerku | přijato doporučení (R-070) |
| D-K5 | Hlášení z Claude Code: schvalovat vždy, nebo i automaticky publikovat | schvalovat; automatické publikování per projekt až po důvěře a jen bez citlivých řetězců | přijato doporučení (R-070) |
| D-K6 | Admin: kolik se přepracuje | layout + Dnes + detail zakázky, pak postupně ostatní; Hub zůstává osobně stranou | přijato doporučení (R-070) |
| D-K7 | Předání do Claude Code: která úroveň | 1 (hotovo) + 2; úroveň 3 jen po experimentu a samostatném rozhodnutí | přijato doporučení (R-070) |
| D-K8 | Soubory od klienta (screenshoty, podklady): ano/ne a kam je ukládat | odložit; až bude potřeba, úložiště rozhodnout zvlášť | přijato doporučení (R-070) |
| D-K9 | Větev: admin patří na `main`, ale kód je na `ws/redesign-app` (Next 16, `main` je starší) | pracovat na větvi nad `ws/redesign-app` a sloučit s ní | přijato doporučení (R-070) |
| D-K10 | Jak dlouho držet data klientů po skončení zakázky (aktivita, zprávy, požadavky) | 3 roky, pak anonymizace nebo výmaz; GDPR žádost okamžitě | přijato doporučení (R-070); implementováno migrací 098 a cronem `client-retention` (R-076) |
| D-K11 | Zavést firmu klienta jako samostatný záznam (víc projektů pod jednou firmou) | ano, `portal.clients`; propojení se zakázkou při pozvání | přijato doporučení (R-070) |
| D-K12 | Kdo nastaví klientovi heslo | klient sám z pozvánky vázané na jeho e-mail; nikdo jiný heslo nezná | **rozhodl Kryštof 2026-11-18 (R-121)** |
| D-K13 | Konzultace: kdy a jak | **jen v časech, které Kryštof v kalendáři označí jako volno pro klienty** (rozhodl Kryštof 2026-11-18). Parametry: 30 min (u volna jde změnit), nejdřív 2 h předem, přesun a zrušení do 24 h předem, počet neomezený | **rozhodl Kryštof 2026-11-20 (R-126)** |
| D-K14 | Etapy | šablona podle druhu služby, obsah píše Kryštof, u nové zakázky se předvyplní a jdou upravit (rozhodl Kryštof 2026-11-18). Zbývá v KP12: počítat postup v % z hotových etap? Doporučení ano, ruční % zmizí | **rozhodl Kryštof 2026-11-18 (R-124):** postup v % z hotových etap, zakázka bez etap si nechá ruční % |
| D-K15 | Kdo vidí peníze | každý klient u svých zakázek vidí cenu, zaplaceno, zbývá a faktury, bez přepínače; online platba ne | **rozhodl Kryštof 2026-11-18 (R-121)** |
| D-K16 | Co je „analýza" pro klienta: návštěvnost jeho webu, poptávky z jeho webu, nebo kolik práce a peněz projekt stál | poptávky z jeho webu | **rozhodl Kryštof 2026-11-20: poptávky z jeho webu**, po měsících; návštěvnost ne, práce a peníze už v KP13 a KP16 (R-129) |
| D-K17 | Chat a dnešní „Požadavky": dvě místa, nebo jedno | jedno: požadavek je zpráva v chatu (i hlasová) a Kryštof z ní v adminu udělá zadání pro Claude Code; samostatná sekce Požadavky v prostoru zmizí, historie zůstane v chatu | **rozhodl Kryštof 2026-11-20 (R-127):** sloučit, Požadavky v prostoru zmizely, staré zůstaly ve vlákně |
| D-K18 | Obrázky a PDF v chatu: kam je ukládat | soukromé úložiště, soubor jen přes náš server s kontrolou členství, typ podle obsahu (ne přípony), limit velikosti, retence se zakázkou. Kandidáti: Vercel Blob, nebo Supabase Storage (projekt `zakaziq` už existuje). Nová závislost a CSP jen se souhlasem. Nahrazuje D-K8 pro přílohy v chatu | **rozhodl Kryštof 2026-11-20 (R-127):** soukromý bucket `chat-prilohy` v Supabase Storage, soubory jen přes náš server, 4 MB na odeslání |
| D-K19 | Kdo vidí aktivitu druhé strany | přečteno (dvě fajfky) vidí obě strany jako ve WhatsAppu; Kryštof navíc vidí, kdy byl klient naposledy aktivní; **klient Kryštofovu aktivitu nevidí**, aby nečekal okamžitou odpověď jen proto, že je Kryštof zrovna v adminu | **rozhodl Kryštof 2026-11-20 (R-127):** přečteno vidí obě strany, poslední aktivitu klienta jen Kryštof, Kryštofovu klient ne |
| D-K20 | Jak se poptávka z webu klienta dostane do ZakazIQ: (a) **jen počet** — web klienta při odeslání formuláře pošle s klíčem zakázky událost „poptávka" nebo „objednávka" bez jména a kontaktu, poptávka sama jde klientovi e-mailem jako dnes; (b) **celá poptávka přes ZakazIQ** — uložíme ji, pošleme klientovi e-mailem a ukážeme seznam v prostoru (víc užitku, ale ZakazIQ se stává zpracovatelem osobních údajů zákazníků klienta: smlouva, retence, spam, doručitelnost); (c) **jen klienti s Workspace** — jejich web už posílá poptávky do Workspace (R-024), prostor by ukázal čísla odtud | (a): přesně odpovídá D-K16 (počty po měsících), žádné osobní údaje navíc, napojení je jeden řádek ve formuláři webu a klíč jako u hlášení z Claude Code (KP04) | **rozhodnuto 2026-11-20: (a) jen počet** (Kryštof) |

## 8. Rizika

- **Admin je v produkci.** Každé sezení KP01–KP04 prochází regresí `/login`, `/dashboard`, `/alteno`, `/hub`, `/p/[token]` a změny jdou po stránkách, ne naráz. Produkce běží na starém buildu; nic z tohohle se k zákazníkům nedostane bez sloučení větve a deploye (jen se souhlasem).
- **Větev.** Pokud se `main` mezitím posune, rebase před každým sezením (D-K9).
- **Rozsah.** Klientský prostor je druhý velký celek vedle Workspace, který ještě nemá produkční Clerk, Stripe live ani ověřený Resend. KP05 sdílí práci s produkčním Clerkem; spuštění Workspace tím nezdržet.
- **Experimentální platformní funkce.** Routines API a Channels se mění; KP09 před implementací znovu přečte aktuální dokumentaci a nestaví na nich nic, co nejde vrátit.
- **Přepis hlasu.** Modely OpenAI pro přepis mají hlášená vyřazení v roce 2027; název modelu je v env. Rezidence a DPA ověřeny 2026-11-01, viz 8.1.
- **Důvěra klienta.** Špatně napsané automatické hlášení působí hůř než žádné. Proto schvalování a texty podle `zakaziq-ux-texty-cs` a `humanize-text-cs`.

### 8.1 Zpracovatelé AI: DPA a místo zpracování (ověřeno 2026-11-01, KP10)

| | OpenAI (přepis hlasu, `lib/transcribe.ts`) | Anthropic (shrnutí požadavku, `lib/client-request-ai.ts`) |
|---|---|---|
| DPA | Verze 01/2026 je součástí OpenAI Services Agreement; pro zákazníky z EHP je smluvní stranou OpenAI Ireland Ltd. Zda je přijata automaticky, nebo přes formulář (starší podmínky 2023 formulář chtěly), z veřejných stránek jisté není → **ověřit v nastavení organizace OpenAI / u podpory** | Součást Commercial Terms automaticky, bez podpisu (účinnost 24. 2. 2025) |
| Předání mimo EU | SCC 2021, modul 2 a 3 | SCC modul 2 a 3 zahrnuté v DPA |
| Místo zpracování | Dnes `api.openai.com` = USA. Evropská rezidence pro `/v1/audio/transcriptions` existuje (i `gpt-4o-mini-transcribe`, `eu.api.openai.com`), ale jen pro projekt s regionem Evropa **a schválenou nulovou retencí nebo upraveným dohledem nad zneužitím** (žádost přes sales) | Vlastní API nemá EU: výpočet `global` nebo `us`, uložení jen `us`. EU jen přes Bedrock/Vertex (jiná integrace) |
| Retence | Přepis: tabulka OpenAI u `/v1/audio/transcriptions` neuvádí uchování pro dohled nad zneužitím; data API se netrénují | Podle zásad retence API; netrénuje se |

Důsledek pro texty: oba poskytovatele uvést jako zpracovatele s předáním do USA na základě SCC. Pokud bude potřeba EU rezidence přepisu: požádat OpenAI o EU projekt, pak jen změnit `ENDPOINT` na `https://eu.api.openai.com/v1/audio/transcriptions` a klíč projektu (bez další změny kódu). Zdroje: [OpenAI Your data](https://developers.openai.com/api/docs/guides/your-data), [OpenAI DPA PDF](https://cdn.openai.com/pdf/openai-data-processing-addendum.pdf), [Anthropic DPA](https://www.anthropic.com/legal/data-processing-addendum), [Claude data residency](https://platform.claude.com/docs/en/manage-claude/data-residency).

## 9. Odhad provozních nákladů

Orientační, ceníky ověřit při nasazení:

| Položka | Odhad |
|---|---|
| Přepis hlasu (OpenAI) | asi 0,07–0,14 Kč za minutu; 600 minut měsíčně ≈ 40–85 Kč |
| Shrnutí požadavků a hlášení (Claude) | jednotky haléřů za požadavek |
| Přihlášení klientů (Clerk) | v rámci stávajícího plánu, ověřit limit aktivních uživatelů |
| Routines (úroveň 3) | čerpá předplatné Claude Code jako běžná session |
| Úložiště souborů (KP08) | rozhodne se samostatně |

## 10. Mimo rozsah

Online platby klientů (klient od R-121 vidí faktury a platí převodem nebo QR kódem), vícejazyčnost, SMS a WhatsApp, mobilní aplikace, plně automatické spouštění agenta z textu klienta, změna Workspace pro firmy (SaaS) a Hub (osobní moduly).

## 11. Kritéria úspěchu

- Po práci v Claude Code vznikne hlášení bez psaní a Kryštof ho schválí **jedním klikem**.
- Klient se po pozvánce přihlásí do **2 minut** a na první obrazovce vidí stav, fázi a poslední aktivitu.
- Z úvodní stránky admina jsou požadavky, schvalování a faktury po splatnosti **na 1 klik**.
- Hodnocení klienta se nabídne samo; Kryštof už nikomu neposílá odkaz ani QR kód.
- Test oddělení klientů v PGlite ověřuje, že klient A nikdy nevidí data klienta B ani koncepty a interní pole.

## 12. Zápis do paměti

Po odsouhlasení: R-070 (rozsah, pořadí, D-K1–D-K11) v `memory/memory.md`, řádek v `memory/index.md` je. Po každém sezení: changelog + stav v tabulce výše (přepsat sloupec Stav) + bezpečnostní změna do `.claude/security/`.

## 13. Zdroje

- Routines API: <https://platform.claude.com/docs/en/api/claude-code/routines-fire>, <https://code.claude.com/docs/en/routines>
- Channels: <https://code.claude.com/docs/en/channels-reference>
- Hooks: <https://code.claude.com/docs/en/hooks>
- Související v repu: `memory/memory.md` R-027, R-035, R-036, R-037, R-063, R-069; `.claude/security/DECISIONS.md` #012, #017, #018; `docs/AGENTS-REFERENCE.md` B3, B4, B13; `docs/admin/AGENTS-ADMIN.md`.
