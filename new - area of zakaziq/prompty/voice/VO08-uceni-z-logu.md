# VO08 — Učení z logů

> Sezení pro Claude Code v kořeni repa ZakazIQ, větev `admin/zakaziq-voice`. Jde kdekoli.

## Cíl jednou větou

Z oprav, které Kryštof udělá po vložení, se server naučí slova do slovníku a připraví návrhy
blokovaných frází a pravidel stylu; slovník a nastavení jdou měnit i z Macu.

## Než začneš

1. Skill `zakaziq-memory` (začátek), `zakaziq-workspace-backend`, `web-security-review`.
2. Plán `docs/admin/VOICE-PLAN.md` oddíly 2 (D-V7, D-V8), 5 (celé), 6, 7 (`/feedback`,
   `/terms`, `/settings`).
3. Vzory: denní cron `app/api/cron/send-reminders/route.ts` (co v něm visí a jak se volá
   týdenní úloha), `app/api/cron/client-retention/route.ts` a
   `lib/admin/meeting-notes-retention.ts` (úklid), `lib/project-activity.ts` (`redactSensitive`).
4. Návrh: `podklady/navrh-serveru/learn.ts.txt`, `learner.ts.txt`, `feedback.route.ts.txt`,
   `terms.route.ts.txt`, `settings.route.ts.txt`.

## Rozsah

- `app/api/public/voice/feedback/route.ts` — `{ id, editedText }` přes Zod (`readJsonLimited`,
  20 000 znaků), jen pro diktát téhož zařízení, jen do 24 h od diktátu, ne po smazání textu;
  uloží `edited_text`, `user_edits` a dvojice oprav. Opakovaná oprava téhož diktátu nahradí
  předchozí (dvojice se nezdvojí).
- `lib/admin/voice/learn.ts` — rozdíl po slovech (LCS): dvojice „slyšel → opravil" o 1–3
  slovech; jen interpunkce se nepočítá, velká písmena ano; přepsáno víc než 50 % slov = nový
  text, neučit; celý text smazaný = signál pro blokovanou frázi.
- `lib/admin/voice/learner.ts` — pravidla z plánu oddíl 5:
  - stejná dvojice ve 3 různých diktátech za 60 dní a vypadá jako jméno nebo pojem →
    při `auto_learn_terms` rovnou slovo do slovníku (`source = learned`, `heard_as` doplněné),
    jinak návrh `term`; podobnost počítej přes normalizaci bez diakritiky (Levenshtein ≥ 0,6);
  - stejná fráze celá smazaná ve 2 diktátech → návrh `blocklist`;
  - **týdenní rozbor AI** (role `smart`): v pondělí z `send-reminders`, jen když je od minula
    ≥ 8 oprav; vstup projde `redactSensitive()`; výstup JSON přes Zod (nejvýš 5 návrhů pravidel
    stylu, každý ≤ 300 znaků s ≥ 2 id diktátů jako příklady); návrh bez příkladů nebo s cizím
    id se zahodí; nic se neaplikuje samo; strop tokenů;
  - `dedupe_key`, ať se tentýž návrh neopakuje; odmítnutý návrh se znovu nenavrhne.
- Co učení vrací do přepisu a čištění: slova ze slovníku do nápovědy přepisu a do promptu,
  aktivní pravidla, 5 posledních přijatých příkladů (VO07 to čte — ověř, že se to opravdu
  dostane do promptu).
- `app/api/public/voice/terms/route.ts` — `GET` seznam, `POST` přidat nebo upravit
  (`{ kind, term, heardAs[], expansion? }`), `DELETE ?id=`; scope `write` s vlastním limitem.
- `app/api/public/voice/settings/route.ts` — `GET`, `PATCH` jen povolených klíčů (`styles`,
  `store_text`, `auto_learn_terms`, `cleanup_enabled`), Zod.
- **Úklid** (`lib/admin/voice/retention.ts`) z cronu `client-retention`: texty po
  `text_retention_days` na NULL + `text_purged_at`, jen když je lhůta nastavená (výchozí NULL = natrvalo, D-V7);
  `voice_corrections` a návrhy vlastní lhůtu nemají, mizí se smazaným diktátem. Diktáty s čísly zůstávají.
- Funkce pro admin (VO10 je zobrazí): seznam návrhů s příklady, přijmout, odmítnout, vrátit,
  „naučené samo" s Vrátit, „Spustit učení teď".

## Mimo rozsah

Zachycení oprav na Macu (VO09), obrazovky v adminu (VO10).

## Testy

- `learn`: dvojice z rozdílu, interpunkce, velká písmena, přepsaný text, smazaný text.
- `learner` (PGlite): 3× stejná oprava → slovo se naučí, 2× → ne, vypnuté učení → návrh,
  odmítnutý se nevrátí, blokovaná fráze, rozbor AI s podvrženou odpovědí (platná, bez
  příkladů, s cizím id, poškozený JSON).
- Route: `/feedback` cizí diktát 404, starší než 24 h odmítnutý, `/terms` a `/settings`
  validace a limit, `Origin` 403.
- Úklid: text po lhůtě pryč, čísla zůstala.

## Hotovo, když

- Oprava z Macu (zatím `curl`) se zapíše a po třech stejných se slovo objeví ve slovníku
  a projeví v dalším diktátu.
- Rozbor AI jen navrhuje, nic nemění sám.
- Úklid maže texty podle nastavení.
- `tsc`, `npm test`, `build:check` prošly. DECISIONS #055: co se z oprav ukládá a jak dlouho,
  co jde do rozboru AI.

## Konec sezení

`web-security-review`. Skill `zakaziq-memory`. Stav VO08 v plánu. Commit
`feat: voice učení z oprav a slovník`.
