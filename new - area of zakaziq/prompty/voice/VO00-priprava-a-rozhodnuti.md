# VO00 — Příprava: plán do repa, rozhodnutí, ceny, test přepisu češtiny

> Sezení pro Claude Code na **MacBooku**, v kořeni repa ZakazIQ. Jedno sezení = jedna konverzace.

## Cíl jednou větou

Dostat plán ZakazIQ Voice do repa na novou větev, potvrdit s Kryštofem rozhodnutí (R-148),
ověřit aktuální ceny a podmínky poskytovatelů a změřit, který přepis češtiny je nejlepší.

## Než začneš

1. Použij skill `zakaziq-memory` (začátek sezení): přečti `memory/index.md`, `memory/memory.md`,
   `memory/pravidla.md`, `AGENTS.md`.
2. `git status` a `git branch --show-current`. Cizí neuložené změny nech být.
3. Kryštof má rozbalený zip s plánem (výchozí `~/Downloads/zakaziq-voice-plan`). Zeptej se,
   jestli je jinde.

## Kroky

1. **Větev a plán do repa.** Z aktuálního `main` vytvoř větev `admin/zakaziq-voice`.
   Obsah `zakaziq-voice-plan/repo/` zkopíruj do kořene repa (`ditto <zip>/repo .`): přibude
   `docs/admin/VOICE-PLAN.md` a `new - area of zakaziq/prompty/voice/`. Nic jiného se nemá
   změnit — ověř `git status`.
2. **Přečti celý plán** `docs/admin/VOICE-PLAN.md`.
3. **Rozhodnutí.** Projdi s Kryštofem oddíl 2 (D-V1 až D-V13). Použij AskUserQuestion jen na
   to, co není jasné nebo co by šlo udělat jinak s velkým dopadem: D-V2 (server, nebo přímo
   z Macu), D-V5 (složka `voice-mac/` v repu), D-V7 (90 dní textu), D-V8 (učení samo).
   Ostatní ber jako potvrzené. Výsledek zapiš:
   - do `memory/memory.md` → Rozhodnutí jako **R-148 · ZakazIQ Voice** (číslo ověř — má být
     další volné; Rozhodnutí, Proč, Důsledek, odkaz na plán),
   - změny do plánu, oddíl 2.
4. **Ověř, co se mění v čase** (WebSearch / WebFetch, s datem do plánu, oddíl 12 a 13):
   - ceník Groq pro `whisper-large-v3-turbo` a `whisper-large-v3` (cena za hodinu zvuku,
     nejkratší účtovaná délka, limity bezplatného plánu, limit velikosti souboru),
   - že Groq v `response_format: verbose_json` vrací segmenty s `no_speech_prob`,
     `avg_logprob`, `compression_ratio` a že bere `language` a `prompt`,
   - podmínky uchovávání dat u Groq (zpracovatel, DPA, kde zpracovává),
   - cenu záložního přepisu OpenAI (model z `lib/transcribe.ts`) a cenu modelu za rolí `fast`
     v `lib/ai/models.ts` (skill `product-self-knowledge` nebo docs.claude.com).
   Doplň do plánu tabulku cen a přepočti odhad nákladů pro 3 000 slov denně.
5. **Klíč Groq.** Kryštof si vytvoří klíč na console.groq.com a **sám** ho vloží do
   `.env.local` jako `GROQ_API_KEY=…`. Ty soubor nečteš a klíč nevidíš; ověř jen, že proměnná
   existuje (`grep -c '^GROQ_API_KEY=.' .env.local` — vypíše jen počet řádků). Přidej `GROQ_API_KEY`, `VOICE_STT_PROVIDER`, `VOICE_GROQ_STT_MODEL`,
   `VOICE_OPENAI_STT_MODEL` do `.env.example` a do tabulky env v `docs/AGENTS-REFERENCE.md` → A
   (bez hodnot).
6. **Test přepisu češtiny.** Napiš vývojový skript `scripts/voice-stt-test.mjs`:
   - vstup: složka s nahrávkami `*.m4a` a ke každé `*.txt` s tím, co se opravdu řeklo,
   - pro každou nahrávku zavolá Groq `whisper-large-v3-turbo`, Groq `whisper-large-v3`
     a OpenAI (model z env), `language=cs`, a změří čas odpovědi,
   - spočítá chybovost slov (WER, po malých písmenech a bez interpunkce) a vypíše tabulku:
     poskytovatel, průměrná a nejhorší WER, p50/p95 času, odhad ceny,
   - klíče čte z `.env.local` stejně jako ostatní skripty v `scripts/` (podívej se, jak to dělá
     `scripts/apply-migration.js`), klíče nevypisuje, nahrávky nikam neukládá,
   - jedna nahrávka je **5 s ticha** (QuickTime nebo `sox`): očekávaný text prázdný — ukáže,
     který přepis si vymýšlí.
   Nahrávky jsou Kryštofův hlas: patří do `~/ZakazIQ-voice-test/`, **ne do repa**. Kryštof
   nahraje asi 10 vět, jak bude opravdu diktovat (e-mail klientovi, zpráva do Slacku, zadání
   pro Claude s anglickými slovy, čísla a data, jména „ZakazIQ", „Prvotka", „VIZEON").
   Nemá-li čas, vyrob dočasně pár vět hlasem macOS: `say -v Zuzana "…" -o a.aiff && afconvert
   -f m4af -d aac a.aiff a.m4a` (horší než skutečný hlas, napiš to k výsledku).
   Výsledek a doporučení výchozího poskytovatele zapiš do plánu (D-V3).
7. **Mac je připravený?** Zjisti a zapiš do plánu (oddíl 10 poznámka): `sw_vers`,
   `swift --version`, `xcode-select -p`, jestli je Xcode, nebo jen Command Line Tools.
   Na podpis aplikace bude ve VO03 potřeba stálá identita: zeptej se, jestli Kryštof chce
   vlastní certifikát v Klíčence (Certificate Assistant → Create a Certificate → typ Code
   Signing, název „ZakazIQ Voice vývoj") — doporučené — nebo Apple Development přes Xcode.
   Vytvoření certifikátu dělá Kryštof sám, ty jen připravíš krok za krokem.
8. **Paměť a index.** Do `memory/index.md` řádky pro `docs/admin/VOICE-PLAN.md`
   a `new - area of zakaziq/prompty/voice/00-README.md`. Changelog. Stav VO00 v plánu.

## Hotovo, když

- Větev `admin/zakaziq-voice` existuje a má plán a prompty v repu.
- R-148 je v paměti, plán oddíl 2 odpovídá tomu, co Kryštof potvrdil.
- Ceny a podmínky jsou ověřené s datem a odkazem; odhad nákladů přepočtený.
- `scripts/voice-stt-test.mjs` běží a výsledek testu přepisu je v plánu (nebo je jasně
  napsané, proč chybí).
- `GROQ_API_KEY` je v `.env.local` (ověřeno bez vypsání) a čtyři nové proměnné
  v `.env.example` i v referenci.

## Konec sezení

Skill `zakaziq-memory` (konec sezení). Commit na `admin/zakaziq-voice`: `docs: voice plán,
rozhodnutí R-148 a test přepisu` (stageuj jen dotčené soubory). Napiš Kryštofovi výsledek
testu přepisu jednou větou a že další je VO01.
