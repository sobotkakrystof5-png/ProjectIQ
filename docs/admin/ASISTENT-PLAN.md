# Asistent, který ovládá admin za Kryštofa — plán (R-111)

> Stav (2026-11-16): **A0–A4 v kódu**. Neprovedeno v prohlížeči a nic není commitnuté ani nasazené — viz oddíl 7. Navazuje na AD14 (R-084, R-100): asistent už umí věta → návrh → klik. Tenhle plán z něj dělá asistenta, který práci **provede sám** a člověk ji jen kontroluje a v případě omylu vrací.

## 1. Cíl

Kryštof napíše (později namluví) větu: „přidej Nováka, ve čtvrtek ve 14 ho zapiš, zálohu 5 000 přišla". Asistent kontakt založí, termín zapíše, zálohu zaúčtuje a ukáže, co udělal, s tlačítkem **Zpět**. Žádný formulář, žádné klikání přes tři obrazovky.

Pokrytí: kontakty, hovory, kalendář (vytvořit, přesunout, zrušit), zakázky a jejich stav, poznámky, zálohy a platby, náklady, faktury (vystavit, stornovat, označit zaplacenou), zprávy klientům.

## 2. Rozhodnutí o samostatnosti (R-111)

Z R-084 („asistent navrhuje, člověk potvrdí") se stává **„asistent provede, člověk vrací"**, s výjimkami níže. Kryštof to zadal 2026-11-16 („aby to dělal všechno on za mě").

| Třída | Co | Chování |
|---|---|---|
| Vratné | kontakt, termín (vytvořit / přesunout / zrušit), poznámka, stav zakázky, zakázka, záloha a platba, náklad, úprava kontaktu, „faktura zaplacena" | provede hned, toast **Zpět** (8 s), pak „Vrátit" v historii asistenta |
| Jedno klepnutí | **odeslání zprávy** klientovi (e-mail, SMS, WhatsApp), **vystavení faktury**, **mazání** | asistent vše připraví, člověk jednou klepne; výsledek se nedá vzít zpět beze stopy |
| Nikdy | úprava už vystavené faktury (trigger z migrace 107, R-098), cokoli mimo seznam akcí | oprava faktury = storno + nová; asistent to řekne a nabídne |

Pojistka proti podstrčenému pokynu: **jakmile je v kontextu text napsaný klientem** (požadavek z portálu, poznámka AI leadu), auto-provedení se vypne a všechno čeká na klepnutí. Text od klientů je nedůvěryhodný vstup (R-069).

Seznam tříd je výchozí návrh — Kryštof může „jedno klepnutí" povolit jinak.

## 3. Kroky

| Krok | Obsah | Odhad |
|---|---|---|
| A0 | Ověřit stávající asistent naživo (skutečný dotaz na model, tvar strukturovaného výstupu, `cache_read_input_tokens` > 0). Dosud nikdo neviděl. | 0,5 sezení |
| A1 | **Hlas a tlačítko:** `MediaRecorder` v panelu, přepis přes stávající `lib/transcribe.ts`, plovoucí tlačítko. Do přepisu pošlet jména kontaktů (parametr `prompt`). `Permissions-Policy` `microphone=(self)` i pro admin + zápis do `.claude/security/`. | 1–2 |
| A2 | **Víc akcí a víc vět:** návrhy jako pole, nové druhy akcí (zakázka, záloha, náklad, přesun/zrušení termínu, úprava kontaktu, storno faktury), dohledání záznamu podle jména (trigramové indexy z migrace 103), doptání při nejednoznačnosti („který Novák?"). | 2–3 |
| A3 | **Auto-provedení se Zpět:** snímek před změnou v `ai_suggestions`, stav `applied_auto`, historie asistenta, pojistka z oddílu 2. | 1 |
| A4 | **Dotazy na data:** read-only nástroje (hledání kontaktu, volné časy, zakázky, dluhy). Sonnet 5.5 neumí vynucený `tool_choice` → `auto` + `strict: true`. | 2 |

Celkem 6–8 sezení. Po A1 jde mluvit a vidět návrh, po A3 se věci dějí samy.

## 4. Náklady provozu (odhad, kurz 22 Kč/$)

Ceny Anthropic z cache skillu k 2026-11-03: Haiku 5.5 $0,10 / $0,50, Sonnet 5.5 $2 / $10 za milion tokenů. Cena přepisu OpenAI je z paměti a **neověřená** (~$0,006/min).

- text, jeden krok: ~0,07 Kč za příkaz
- hlas (30 s) + návrh: ~0,15 Kč
- hlas + vícekrokový agent s dotazy na data (Sonnet): ~1 Kč

Při 20 příkazech denně vychází **50–600 Kč měsíčně**, podle toho, kolik dat asistent čte. Žádná nová služba ani předplatné. Přidat **denní strop** volání (dnes je jen 12/min).

## 5. Rizika

- Špatně slyšená jména a data → vždy ukázat, co se stalo; při nejistotě (`confidence` pod prahem) nic neprovádět a zeptat se.
- Soukromí: hlas jde do USA (OpenAI), jména a telefony k Anthropic. Doplnit do právních textů (už je to otevřený problém).
- E-maily z adminu dnes nechodí (Gmail SMTP 535, memory.md → Otevřené problémy) → `send_message` zůstane odkazem (`mailto:`/SMS), dokud se to neopraví.
- Duplicitní kontakty: `createLead` se na `contacts` dosud nenapojuje (otevřený problém z AD09/AD10) — řešit v A2.

## 6. Hotovo, když

Kryštof řekne větu s kontaktem, termínem a zálohou a všechno je v systému do 5 sekund; Zpět vrátí každý krok; podstrčený pokyn v textu klienta nic neprovede sám; měření JS balíčku adminu (ukazatel z plánu modernizace) nepřekročí strop; testy jsou na všech třech třídách akcí.

## 7. Stav a odchylky (2026-11-16)

Hotovo v jednom sezení (větev `auth/supabase-klient`, necommitnuto):

- **A0** — živá zkouška se skutečným modelem. **Strukturovaný výstup se schématem API odmítlo** („compiled grammar is too large", pak strop 16 polí s `null` a 24 nepovinných). To se týkalo i původního asistenta z AD14 — ten tedy naživo nejspíš nikdy nefungoval. Řešení: model vrací JSON podle popisu v promptu, přísnou kontrolu dělá `lib/ai/plan-format.ts`. Po úpravě šest vět ze šesti správně (termín s kontaktem, záloha, přesun, faktura, dvě akce naráz, dotaz), haiku ~2,5–3 s.
- **A1** — hlas (`/api/ai-assistant/prepis`, nápověda jmen klientů), plovoucí tlačítko, `microphone=(self)` na `/dashboard` (DECISIONS #032).
- **A2** — plán až s osmi akcemi, 13 druhů (navíc přesun a zrušení termínu, zakázka, záloha a příjem, náklad, zaplacení a storno faktury, vystavení faktury), hledání se skloňováním.
- **A3** — auto-provedení se „Zpět" a „Vrátit" u každého kroku.

Odchylky od oddílu 2: pojistka proti cizímu textu se uplatní u **každého** kontextu záznamu (na detailu zakázky nebo kontaktu se nic neprovede samo, jen na klepnutí) — rozlišovat sloupce psané klientem by bylo křehké. Vystavení faktury je jen na klepnutí a jen s úplným odběratelem (jméno i adresa), jinak otevře předvyplněný formulář; u plátce DPH vždy formulář.

- **A4** — dotazy na data, jen čtení, pět pevných tvarů (`lib/admin/assistant-lookups.ts`): kalendář za období (tytéž zdroje jako obrazovka Kalendář), volný čas v den (pracovní doba 8–18, admin žádnou nastavenou nemá), zakázka s doplatkem (`remainingSql`, i ruční zálohy), kontakt, nezaplacené faktury a nedoplacené zakázky. Model si o data řekne (`lookups`), server je provede a model odpoví ve druhém kole. Bez poznámek a popisů (píší je klienti); plán sestavený nad daty se **neprovede sám**. Ověřeno živě s podstrčenými daty: dluh, volno, týden v kalendáři a „zapiš na první volné místo" — 4 ze 4, 3–5 s.

Zbývá: průchod v prohlížeči na 390 / 1280 px s přihlášením a databází s migrací 110 (testovací Neon ji nemá), commit a nasazení se souhlasem.
