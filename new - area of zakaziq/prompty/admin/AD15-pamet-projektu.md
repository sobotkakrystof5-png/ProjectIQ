# AD15 — Paměť projektu

## Cíl
Formuláře se předvyplňují z historie a systém si pamatuje kontext, ze kterého staví návrhy.

## Než začneš
Rituál začátku. Přečti plán sekci 5 (AD15), R-076 (retence 3 roky) a R-085 v `memory/memory.md`.
Skilly: `zakaziq-workspace-backend`, `web-security-memory`.
Soubory: `lib/project-activity.ts:86-93` (`redact()`, `hasRedactionMarker`), `migrations/098_client_retention.sql`
(vzor retence), `lib/client-retention.ts`, `app/api/cron/client-retention/route.ts`,
`components/{ProjectForm,CostsManager,InvoiceFields}.tsx`.

## Kroky
1. **Dvě oddělené vrstvy — nemíchat je.**
   - **Deterministické předvyplnění** (nový `lib/admin/memory/facts.ts`): čistě SQL nad historií,
     **bez AI**, nikdy se neukládá jako text. Poslední cena u klienta, obvyklá hodinová sazba,
     průměrná doba dokončení, typický zdroj leadu, poslední položky faktury, poslední kanál kontaktu,
     typická délka termínu. **Tohle plní formuláře.**
   - **AI shrnutí kontextu** (**migrace 111** — 105 zabralo AD10, 109 AD13, 110 AD14; migrace
     **není** společná s AD14, viz R-100): `project_memory (id, scope CHECK
     ('project','contact','global'), ref_id uuid, kind CHECK ('summary','preference','risk','glossary'),
     text, source, model, created_at, valid_until, confirmed_by text NULL)`.
2. **Kdy se zapisuje.** Jen (a) na kliknutí „Uložit do paměti“, nebo (b) cronem z nových řádků
   `project_activity` — ale pak `confirmed_by IS NULL` a v UI jako „Návrh paměti“. Nepotvrzené se
   používá, je **označené** a vyprší za 90 dnů.
3. **Použití.** Prompt asistenta dostane `facts` (kompaktní deterministický JSON, tedy cachovatelný
   prefix) + nejvýš N řádků `project_memory` pro daný scope. **Formuláře používají jen `facts`** —
   do předvyplněného pole nikdy nesmí vstoupit text, který napsal model.
4. **Ochrana proti klíčům a osobním údajům.** Každý ukládaný text projde `redact()`
   z `lib/project-activity.ts` (**použij, nekopíruj**) a text s `REDACTION_MARK` se odmítne uložit
   (`hasRedactionMarker` tam už je). Test, že `sk-…`, connection string a řádek z `.env` se do paměti
   nedostanou.
5. **Retence a GDPR.** `valid_until = last_seen_at + 3 roky` (R-076), denní cron maže prošlé —
   připoj na `/api/cron/admin-denne` z AD08 nebo na existující `client-retention`. Smazání kontaktu
   maže jeho paměť: `ref_id` je polymorfní, takže FK to neudělá — úklid musí být ve funkci
   i v akci mazání. Řádky paměti patří do exportu údajů.
6. **UI.** V detailu zakázky a na kartě kontaktu sekce „Paměť“ se zdrojem, datem a platností;
   u nepotvrzených „Návrh paměti“ + Potvrdit / Zahodit.

## Hotovo, když
- Nová faktura i nová zakázka u známého klienta jsou předvyplněné z `facts`.
- V detailu zakázky je „Paměť“ se zdrojem a platností; nepotvrzené je poznat.
- Retenční test prochází; test redakce nepropustí klíč ani connection string.
- Migrace **111** připravená (aplikována: ne), zápis do `.claude/security/` hotový.
- Retence `ai_suggestions` z AD14 doplněná spolu s retencí paměti (DECISIONS #025 ji nechává na AD15).

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD15 v plánu, changelog, fakta do `AGENTS-ADMIN.md`.
Commit `admin/pamet: předvyplnění z historie a kontext zakázky`.
