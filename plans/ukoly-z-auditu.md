# Úkoly z auditu 2026-11-24

> Pracovní seznam pro další sezení. Vychází z auditu skillem `improve` ([`README.md`](README.md) — úplná tabulka, směr, zamítnuté body).
> **Psáno proti commitu `04941fe`.** Čísla řádků jsou z něj. Před každým úkolem soubor otevři a ověř, že kód pořád vypadá, jak je popsané; když ne, úkol přeskoč a zapiš proč.
> V závorce u úkolu je číslo nálezu z auditu (`#3`), ať jde dohledat důkaz.

## Jak s tím pracovat

**Na začátku sezení**
1. `git log --oneline 04941fe..HEAD` — co se změnilo od auditu. Dotčené úkoly znovu ověř v kódu.
2. Výchozí stav: `npx tsc --noEmit` (0 chyb) a `npm test` (dnes 3 známá selhání: `ws-email` s pevným datem, `admin-ai-asistent-crm` a `admin-hovory-asistent` na časový limit pod zátěží).
3. Projdi **Rozhodnutí, která potřebujeme** níž. Úkoly, které na rozhodnutí čekají, bez něj nezačínej.

**Pravidla, která platí pro všechno tady**
- Skoro všechno je admin konzole. Admin se mění jen s výslovným zadáním. Tenhle seznam je zadání ve chvíli, kdy Kryštof řekne „začni balíkem X".
- Větev `fix/audit-2026-11` z `main`. Commit po každém balíku, česky (`fix: …` / `test: …` / `docs: …`). Push na `main` = produkční deploy, jen se souhlasem.
- Databázová změna = nová idempotentní migrace od **131** (poslední je `130_kontakt_jeden_zdroj.sql`). Staré migrace se neupravují. Na produkci ji pouští Kryštof (nebo agent s jeho výslovným souhlasem).
- Každá dokončená změna jde do changelogu `memory/memory.md`. Bezpečnostní změna navíc do `.claude/security/` (STATE, DECISIONS), pak `node scripts/sync-agent-context.mjs --write` a `--check`.
- Větší změna: `npm test`, `npx tsc --noEmit`, `npm run build` (při běžícím dev `npm run build:check`), kontrola `/login`, `/dashboard`, `/dashboard/finance`, `/p/[token]` (AGENTS.md → B12). Nevydávej neprovedené kontroly za hotové.
- Nové byznysové pravidlo = test ve Vitestu nad PGlite (vzory v `lib/__tests__/`).

**Doporučené pořadí:** A → B → C → E1–E3 → F1–F3 → G1 → H1 → I1 → zbytek podle času. D, E5, I2 a J4 čekají na rozhodnutí.

## Rozhodnutí, která potřebujeme (od Kryštofa)

| # | Otázka | Týká se | Doporučení |
|---|---|---|---|
| R1 | Má rychlá změna stavu na „Zaplaceno" nastavit i „Peníze dorazily" a zapsat doplatek? A má odškrtnutí „Peníze dorazily" doplatek z ledgeru smazat? | C1, C2 | Ano na obojí, aby stav a peníze neříkaly dvě různé věci |
| R2 | Má asistent měnit e-mail nebo telefon kontaktu a „zapamatuj si" až po klepnutí? (mění R-111 a R-113) | D1, D2 | Ano. Od R-141 jde změna kontaktu ven (připomínky, SMS) |
| R3 | Přesun konzultace z Hovorů: zakázat s hláškou, nebo přesměrovat do kalendáře? A poslat klientovi zprávu o změně schůzky, když se čas změní v Hovorech? | E2 | Konzultaci v Hovorech nepřesouvat (hláška „Konzultaci přesuňte v kalendáři"), zprávu o změně poslat stejně jako z kalendáře |
| R4 | Připomínky konzultací a hovorů převést z denního cronu na minutovou frontu `meeting_reminders`? | E5 | Ano, fronta už běží každou minutu přes pg_cron |
| R5 | Otočit hesla databází waitlistu startupových projektů (dělá Kryštof v Neonu) | F1 | Ano, po nasazení F1 |
| R6 | Zkrátit `memory/memory.md`: rozhodnutí do zvláštního souboru mimo automatický import, v paměti jen rejstřík? (mění pravidla §4 a R-042) | I2 | Ano |
| R7 | Smazat záložní odesílání přes Gmail SMTP a závislost `nodemailer`? | J4 | Ano, až první skutečné odeslání přes Resend potvrdí, že R-116 funguje |

---

## A · Ověření a CI (první, odblokuje všechno ostatní)

### A1 · CI na `main` zpět do zelené (#1)
- **Problém:** workflow `ci` na `main` padá od 2026-11-17 (37 neúspěchů za sebou). Drží ji jediný test: termín v něm je napevno `2026-11-17T09:00:00Z`, takže je dnes v minulosti a potvrzovací e-mail zapadne jako prošlý.
- **Kde:** `lib/ws/__tests__/ws-email.test.ts:377-378` (`today = '2026-11-16'`, `start = '2026-11-17T09:00:00Z'`), selhává na `:391` (`expect(sent).toHaveLength(1)`). Pevná data jsou i na `:239-365`. Dnes procházejí, ale stejně zestárnou.
- **Oprava:** počítat data od dneška (zítra 9:00 UTC, dnešní pražské datum přes `lib/ws/time.ts`) místo pevných hodnot. Jiná možnost je `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(...)`.
- **Pozor (STOP):** test čte čas i z databáze (`now()` v PGlite). Falešný čas v JS ho nemusí ovlivnit. Když po `setSystemTime` test pořád padá, přejdi na relativní data, ne na další úpravy hodin.
- **Ověření:** `npx vitest run lib/ws/__tests__/ws-email.test.ts` → vše projde. Pak celé `npm test` → selhat smí jen dva známé testy na časový limit.
- **Hotovo, když:** po pushi `gh run list --workflow ci --branch main --limit 1` ukazuje `success`.

### A2 · CI i na ostatních větvích (#19)
- **Problém:** CI běží jen na `main`, `workspace`, `ws/**` a na pull requesty. Větve `admin/**`, `klient/**`, `auth/**`, `fix/**` se testují až po sloučení, tedy současně s produkčním deployem.
- **Kde:** `.github/workflows/ci.yml:9`, totéž `.github/workflows/security.yml` (`on.push.branches`).
- **Oprava:** `branches: ['**']`, nebo vyjmenovat prefixy podle R-015.
- **Hotovo, když:** push na `fix/audit-2026-11` spustí `ci` i `security`.

### A3 · Test route „Schválit a poslat" (#18)
- **Problém:** route vystaví fakturu (číslo z řady) a pak ji pošle. Žádný test ji nepokrývá, sesterská route ano.
- **Kde:** `app/api/invoices/drafts/[id]/send/route.ts` (auth a `Origin` `:44-46`, vystavení `:65`, chyba odeslání `:73-83`). Vzor: `app/api/invoices/[id]/email/__tests__/email-route.test.ts`.
- **Test:** 401 bez session, 403 s cizím `Origin`, 502 při selhání `sendIssuedInvoice` (faktura vystavená jednou, text odkazuje na detail), druhé kliknutí nevystaví druhou fakturu.
- **Hotovo, když:** nový test projde a `npm test` je zelené (kromě známých).

---

## B · Přihlášení do adminu

### B1 · Druhý faktor vynutit v proxy a na každé stránce (#2)
- **Problém:** `getAdminSession()` (`lib/auth.ts:64-70`) odmítne session jen s heslem (`aal1`), když má admin zapsaný TOTP. Proxy to ale nedělá (`lib/supabase/proxy.ts:49-63` kontroluje e-mail a stáří, ne `aal`). Vynucuje to jen `app/dashboard/layout.tsx:10-11`, a layout podle dokumentace Next 16 nebrání vykreslení stránky v RSC payloadu (`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1360`). Z 36 stránek pod `app/dashboard` jich 31 přihlášení samo nekontroluje. Kdo zná heslo, ale ne kód, si může data stránek vyžádat. Server actions a API routy mají vlastní `requireAuth()`, ty jsou v pořádku. Admin má TOTP od 2026-11-21.
- **Oprava (dvě vrstvy):**
  1. V `checkAdminSession` udělat totéž co `lib/auth.ts:66-70`: při `aal !== 'aal2'` zavolat `supabase.auth.mfa.listFactors()` přes session klienta a při zapsaném TOTP vrátit `admin: null` (proxy přesměruje na `/login`). Volání Supabase proběhne jen u session `aal1`, která existuje jen mezi krokem s heslem a kódem.
  2. Do `lib/auth.ts` přidat `requireAdminPage()` (volá `getAdminSession()`, je cachovaná na požadavek, při `null` dělá `redirect('/login')`) a zavolat ji na začátku každé `app/dashboard/**/page.tsx`. Plus hlídací test po vzoru `components/admin/__tests__/admin-classes.test.ts`: projde všechny `page.tsx` pod `app/dashboard` a spadne, když volání chybí.
- **Pozor:** druhý krok přihlášení (`app/(auth)/login`) nesmí být pod `ADMIN_PROTECTED` (`proxy.ts:33`), jinak se admin nedostane k zadání kódu. Ověř, že `/login` s cookie `aal1` funguje.
- **Ověření:** unit test proxy s claims `aal1` a zapsaným faktorem → přesměrování. Hlídací test projde. Na Preview: po kroku s heslem, bez kódu, otevřít `/dashboard/kontakty` → `/login`.
- **Záznam:** `.claude/security/STATE.md` (Aplikace), DECISIONS #029 doplnit, sync do `.agents/`.

---

## C · Peníze (jeden balík, nejdřív testy)

Tři chyby sahají na tentýž výpočet doplatku a ledger. Doplatek je ve dvou kopiích (TS `remainingSql` v `lib/admin/project-payments.ts` a SQL v migraci 122) a R-125 vyžaduje, aby se shodovaly.

### C0 · Nejdřív test, který dnes padá
- `lib/__tests__/kp13-penize-faktury.test.ts:80`: `adminRemaining` obaluje TS kopii ručním `CASE WHEN p.paid THEN 0`, a tím zakrývá, že TS kopie `paid` nezná. Masku odstranit, test pro zaplacenou zakázku pak spadne. Teprve potom opravovat.

### C1 · Doplatek a koncept faktury u zaplacené zakázky (#4)
- **Problém:** `remainingSql` (`lib/admin/project-payments.ts:75-82`) nečte `p.paid`, zatímco SQL kopie (`migrations/122_portal_penize_faktury.sql:125-129`) při `paid` vrací 0. Zakázka „Hotovo" se zaškrtnutým „Peníze dorazily" a bez faktury proto po 15 s dostane koncept faktury na celou zbývající cenu (`lib/admin/invoice-drafts.ts:251-258` hlídá jen `status = 'done'`). Stejnou částku předvyplní nová faktura ze zakázky (`lib/admin/invoice-issue.ts:278`) a asistentovo „vyfakturuj".
- **Oprava:** `remainingSql` → `CASE WHEN ${ref}.paid THEN 0 ELSE GREATEST(...) END`. `remainingToPay` (`:181-193`) dostane volitelné `paid`. V `prepareProjectDoneDraft` přidat `AND NOT coalesce(p.paid, false)`. `loadIssueDraft` předá `paid`.
- **Dotčená volání `remainingSql`** (ověř, že se jejich čísla nezmění, většina už filtruje `paid = false`): `app/dashboard/finance/business-income-actions.ts:79`, `app/dashboard/finance/finance-actions.ts:503`, `lib/admin/project-payments.ts:129,134`, `lib/admin/assistant-lookups.ts:122,190,192`.
- **Čeká na R1** jen v části „stav Zaplaceno = Peníze dorazily" (`app/actions.ts:621-625` mění jen `status`).
- **Ověření:** C0 test projde. Nový test: zakázka `done` + `paid`, bez faktury → `prepareProjectDoneDraft` vrátí `null`.

### C2 · „Peníze dorazily" po zaplacené faktuře nezapíše doplatek (#3)
- **Problém:** `app/actions.ts:451-454` hledá „už zapsaný doplatek" jako jakýkoli příjem zakázky s `deposit_transaction = false`. Příjem, který si založila zaplacená faktura (`lib/invoices.ts:349-361`, `source_project_id` + `source_invoice_id`, `deposit_transaction` výchozí `false`), vypadá stejně, a skutečný doplatek se proto nezapíše. Příklad: zakázka 20 000 Kč, zálohová faktura 8 000 Kč zaplacená, zbytek hotově → po „Peníze dorazily" chybí 12 000 Kč v ledgeru, v Podnikání i v daňovém základu.
- **Oprava:** podmínku zúžit na vlastní doplatek zakázky: `AND category = 'zakázka' AND source_invoice_id IS NULL` (`insertProjectIncome`, `app/actions.ts:100-120`, zapisuje `category 'zakázka'` a `income_origin 'project'`). Proti dvojímu zápisu pak drží index z migrace 109.
- **Čeká na R1** jen v části odškrtnutí (smazat doplatek s `income_origin = 'project'`, který si nepřevzala faktura).
- **Test:** přesně ten příklad: po uložení je v `finance_transactions` příjem 12 000 Kč s `income_origin = 'project'` a „zbývá" je 0.

### C3 · Přepnutí „Fakturováno na IČO" přesune příjem z faktury (#5)
- **Problém:** `app/actions.ts:392-398` přepíše `declared` u všech příjmů zakázky, i u příjmu z vystavené faktury, který synchronizace faktury drží na `declared = true` (`lib/invoices.ts:291,302,339`). Daňový doklad se tak ocitne v nepřiznané linii.
- **Oprava:** do UPDATE přidat `AND source_invoice_id IS NULL AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.finance_transaction_id = finance_transactions.id)`.
- **Test:** zakázka se zaplacenou fakturou, vypnout IČO → příjem z faktury zůstane `declared = true`, ruční záloha se přepne.

---

## D · Asistent (čeká na R2)

### D1 · Změna e-mailu nebo telefonu kontaktu až po klepnutí (#6)
- **Problém:** `update_contact` je třída `auto` (`lib/ai/action-policy.ts:21-33`, výchozí větev). Od R-141 se změna kontaktu propíše do budoucích schůzek (`invite_to`, `meeting_phone`) a přeplánuje SMS (`lib/admin/contact-sync.ts`). Připomínky tak můžou odejít na jinou adresu bez jediného klepnutí a odeslanou SMS „Zpět" nevrátí. Rozchází se to s DECISIONS #032/#034 („nic odchozího samo neběží").
- **Oprava:** v `actionClass` vrátit `confirm` pro `update_contact`, když akce mění `email` nebo `phone`. Ostatní úpravy kontaktu zůstanou `auto`.
- **Test:** existující testy asistenta (`lib/__tests__/ai-executory.test.ts`, `ai-chat.test.ts`) doplnit o třídu akce. Opravit popis v DECISIONS #032 a #051.

### D2 · „Zapamatuj si" až po klepnutí (#14)
- **Problém:** `remember` je `auto` a ukládá se jako potvrzené adminem (`lib/admin/suggestion-apply.ts:653-667`) na tři roky (`lib/admin/memory/store.ts:114-116`). Paměť jde pak do každého promptu bez značky (`store.ts:165-172`, `lib/ai/workspace-snapshot.ts`). Podstrčený text tak přežije chat, ve kterém se objevil.
- **Oprava:** `remember` → `confirm`. Volitelně ukládat záznam od asistenta jako nepotvrzený.
- **Záznam:** DECISIONS #034 (paměť není „jen strukturované údaje").

---

## E · Kalendář, Hovory, připomínky

### E1 · Rezervace z webu nesmí nechat zakázku bez termínu (#7)
- **Problém:** `lib/web-leads.ts:116-127` jsou dva samostatné INSERTy (`projects`, pak `calendar_events`). Při obsazeném termínu (`23P01` z guardu migrace 044) vrátí 409 (`:166-167`), ale zakázka už je v Poptávkách. Po druhém pokusu jsou tam dvě.
- **Oprava:** jeden příkaz s CTE (`WITH p AS (INSERT INTO projects … RETURNING id) INSERT INTO calendar_events … FROM p`). Vzor: `app/calendar-actions.ts:158-180`.
- **Test:** PGlite, vzor `app/api/public/vizeon-leads/__tests__/route.test.ts`: kolize → 409 a v `projects` nic nového. Úspěch → jedna zakázka a jedna událost.

### E2 · Změna času v Hovorech musí jít přes kalendář (#8, čeká na R3)
- **Problém:** `updateLead` (`app/calls-actions.ts:144-147`) volá `admin_lead_reschedule`, která přímo přepíše `calendar_events` (`migrations/105_propojeni_kalendar_hovory.sql:156-165`). R-137 přitom vyžaduje, aby každá změna času šla přes `updateCalendarEvent` (`app/calendar-actions.ts:309-315` → `syncMeetingAfterEdit`). Schůzka s Meetem tak zůstane v Googlu na starém čase, připomínky se nepřeplánují, a u konzultace z klientského prostoru se posune jen zrcadlová událost (`consultation_slots` zůstane). Stejnou cestou jde asistentovo „uprav kontakt" (`lib/admin/suggestion-apply.ts:526-533`).
- **Oprava:** když `admin_lead_reschedule` vrátí `event_id` a událost má `meet_url`, zavolat `syncMeetingAfterEdit(eventId, { timeChanged: true, notifyClient: <R3> })`. U události s `consultation_slot_id` přesun z Hovorů odmítnout česky (nebo podle R3).
- **Test:** vzor `lib/__tests__/admin-pripominky.test.ts:391-400` (podstrčený `moveMeet`).

### E3 · Smazání kontaktu v Hovorech jako mazání v kalendáři (#9)
- **Problém:** `deleteLead` (`app/calls-actions.ts:224-234`) dělá tři samostatné dotazy, maže událost bez ohledu na typ (i zrcadlovou událost konzultace) a v Googlu ji nechá. Řádná cesta je `deleteCalendarEvent` (`app/calendar-actions.ts:340-378`: jeden příkaz, jen `manual`/`block`, Google se smaže po 10 s). Asistentovo „Zpět" u kontaktu jde přes `deleteLead` (`suggestion-apply.ts:740-742`).
- **Oprava:** jeden příkaz s CTE. Událost s `consultation_slot_id` nemazat. `google_event_id` vrátit a smazat stejně jako v `deleteCalendarEvent`.
- **Test:** kontakt se schůzkou s Meetem → událost pryč a Google dostane smazání. Kontakt konzultace → událost zůstane.

### E4 · Převzetí firmy od asistenta jen jednou (#23)
- **Problém:** `takeOverOutreachLead` (`app/outreach-actions.ts:38` kontrola, `:61-79` INSERT) není atomický. Dvojklik založí dva řádky v Hovorech.
- **Oprava:** nejdřív atomický „zábor" (`UPDATE outreach_leads … WHERE client_lead_id IS NULL RETURNING`), pak INSERT, ideálně v jednom příkazu. Vzor: `convertLeadToProject` (`app/calls-actions.ts:263-289`).
- **Test:** dvě souběžná volání → jeden řádek v `client_leads`.

### E5 · Připomínky z denního cronu přes minutovou frontu (#16, čeká na R4)
- **Problém:** `send-reminders` běží jednou denně v 7:00 UTC (`vercel.json:4`), ale okna jsou 23–25 h a 1–3 h (`app/api/cron/send-reminders/route.ts:151-195`). Připomínku „den předem" tak dostane jen termín zítra mezi 8:00 a 10:00 (v létě 9:00 a 11:00), „2 h předem" skoro nic. Příznak „odesláno" se nastaví před odesláním a `false` ze `sendBrandedEmail` (`lib/email.ts:66-91`) se počítá jako úspěch (`route.ts:266-275`). Rozšiřuje otevřený problém „Připomínky 2 h před konzultací".
- **Oprava (podle R4):** konzultace a hovory plánovat do `meeting_reminders` (minutová fronta, `lib/admin/meeting-reminders.ts`). Bez toho aspoň příznak nastavit až po úspěšném odeslání.

### E6 · Minutový běh připomínek se musí vejít do 60 s (#26)
- **Problém:** `maxDuration = 60` (`app/api/cron/meeting-reminders/route.ts:16`), zamkne se 10 zpráv najednou (`lib/admin/meeting-reminders.ts:274-289`) a každé odeslání má timeout 10 s. Když poskytovatel zpomalí, zbytek zůstane v `sending` a po 10 minutách skončí jako „Nejisté, jestli odešla" (`:269-273`).
- **Oprava:** zamykat po jedné (`LIMIT 1` ve smyčce) s časovým rozpočtem kolem 45 s. Co se nestihne, v `finally` vrátit do `pending`.

### E7 · Pražský čas ve dny změny času (#27)
- **Problém:** `pragueWallClockToISO` (`lib/prague-time.ts:33-42`) odhaduje posun zóny z okamžiku na druhé straně změny času. 1:00–1:59 se uloží o hodinu vedle. Používají ho Hovory, asistent a rezervace z webů.
- **Oprava:** posun přepočítat pro výsledný okamžik.
- **Test:** 2026-03-29 01:30 Praha → `2026-03-29T00:30:00.000Z`, 2026-10-25 01:30 Praha → `2026-10-24T23:30:00.000Z`. Plus běžný den v zimě a v létě.

---

## F · Bezpečnost (ostatní)

### F1 · Heslo k databázi waitlistu nesmí do prohlížeče (#10, otočení R5)
- **Problém:** `waitlist_db_url` (connection string cizí databáze s e-maily) vracejí exportované server actions (`app/dashboard/startup/startup-actions.ts:42,64`), dostává ho klientský `components/StartupProjectEditor.tsx` a v DB leží nešifrovaný. `.claude/security/AUDIT-LOG.md:294` tvrdí, že do prohlížeče nejde.
- **Oprava:** do prohlížeče posílat jen `waitlist_db_url IS NOT NULL AS has_waitlist_db`. Pole jen pro zápis („ponechat / nastavit nové"). Ukládat šifrovaně stejně jako Google token (`lib/admin/google/crypto.ts`, klíč `GOOGLE_TOKEN_KEY`), čtení dešifrovat jen v `startup-actions.ts:312,345`. Stávající hodnoty zašifrovat skriptem, nebo při příštím uložení.
- **Záznam:** opravit AUDIT-LOG, zapsat do DECISIONS. Pak R5 (otočit hesla).

### F2 · Limit na IP počítat po /64 i v databázi (#12)
- **Problém:** `lib/api-rate-limit.ts:43` klíčuje předbránu přes `ipRateKey(ip)`, dotaz a zápis (`:45-57`) ale používají celou adresu. Střídáním adres v jedné IPv6 /64 jde přesný limit obejít (kontaktní formulář, poptávky z webů, přepis hlasu). Workspace to má správně (`lib/ws/intake/rate-limit.ts:83-84`).
- **Oprava:** v `isApiRateLimited` i `recordApiRequest` použít `ipRateKey(ip)`.
- **Test:** dvě adresy ze stejné /64 → sdílí limit.

### F3 · Brána na IP i pro veřejná API a widget (#17)
- **Problém:** matcher v `proxy.ts:133-139` vynechává `api/` i `embed/` (kromě `/api/ws`), takže `frontGate` na ně neběží. STATE.md:157 přitom slibuje „120 API požadavků za 10 s". `/embed/<slug>.js` (`app/embed/[file]/route.ts:27-45`) dělá dva dotazy do DB a má jen `public, max-age=300`, což cachuje prohlížeč, ne CDN.
- **Oprava:** matcher rozšířit o `/api/public/:path*`, `/api/klient/:path*`, `/embed/:path*`. V `proxy.ts` pro tyto cesty po bráně jen `NextResponse.next()` (bez CSP a přihlášení). **Webhooky (`/api/stripe`, `/api/clerk`, Resend) a `/api/cron` nechat mimo.** U `/embed` přidat `s-maxage=300`.
- **Záznam:** STATE.md řádek 157 a CSP-LOG, pokud se mění chování hlaviček.

### F4 · Osobní údaje v logách (#29)
- **Kde:** `app/dashboard/startup/startup-actions.ts:382,389` (e-mail příjemce), `app/portal-actions.ts:348,382` (syrová chyba DB), `lib/email.ts:89`, `lib/invoice-ai.ts:122` (celý objekt chyby).
- **Oprava:** logovat jen název nebo kód chyby a id záznamu, e-mail maskovat.

### F5 · Strop těla 5 MB i pro veřejné akce (#28)
- **Problém:** `next.config.mjs:88-93` `bodySizeLimit: '5mb'` (kvůli nahrávání PDF faktury) platí pro všechny server actions, i pro veřejné bez přihlášení.
- **Oprava:** nahrávání PDF přesunout na route handler s `readFormDataLimited` (vzor `app/api/invoices/parse/route.ts`) a globální strop snížit na 1 MB. **Riziko:** rozbité nahrání faktury, takže ověřit testem i ručně.

---

## G · Výkon

### G1 · Chat se nemá obnovovat každých 10 s (#11)
- **Problém:** `tick()` v `components/chat/chat-live.tsx:40` nejdřív zavolá `touch(projectId, true)`, který vždy zapíše `last_read_at = now()` (`migrations/124_chat_s_klientem.sql:295-318`). Otisk adminu (`lib/admin/chat.ts:107-111`, `max(last_read_at)` přes obě strany) i klienta (`lib/portal/chat.ts:57-61`, obě strany) se tak změní při každém tiku. Výsledek: žádné 304 a `router.refresh()` celé stránky každých 10 s.
- **Oprava:** v otisku brát jen čtení **druhé** strany (admin `side = 'client'`, klient `side = 'admin'`). Ta je potřeba kvůli dvěma fajfkám.
- **Test:** dva tiky bez nové zprávy → stejný ETag.

### G2 · Detail zakázky v jedné dávce (#24)
- **Problém:** výchozí záložka dělá zhruba 10 požadavků ve třech vlnách: první dávka, pak `OverviewTab` (`components/admin/project-detail-view.tsx:272-279`) a `MemoryCard` (`components/admin/memory/memory-card.tsx:54-60`). Test strop pro detail nehlídá.
- **Oprava:** načítání převést na dvojice dotaz + mapovač a připojit je do první `batchTolerant`. Strop doplnit do `lib/__tests__/admin-db-rounds.test.ts`.

### G3 · Uložení zakázky v jedné transakci (#25)
- **Problém:** `updateProject` (`app/actions.ts:322-462`) dělá 5–11 požadavků za sebou bez transakce. Když spadne pozdější krok, zakázka je uložená a příjem chybí.
- **Oprava:** po C1–C3 přepsat zápisy příjmů na `INSERT … SELECT … WHERE NOT EXISTS` v jedné `adminDb.batch` (na Neonu je to transakce). Testy `admin-zalohy`, `admin-zakazka-jedina-pravda`, `admin-prijem-datum` musí dál projít.

---

## H · Čas a formát

### H1 · Datum a čas v adminu v pražské zóně (#13)
- **Problém:** `formatDate` a `formatDateTime` (`lib/utils.ts:17-35`) nemají `timeZone`. Na serveru (Vercel běží v UTC) ukazují čas o 1–2 h vedle a kolem půlnoci i jiný den. Mají asi 90 volání, např. Dnes (`app/dashboard/page.tsx:226`) a detail faktury (`app/dashboard/faktury/[id]/page.tsx:388-389`).
- **Oprava:** přidat `timeZone: 'Europe/Prague'`.
- **Test:** `formatDateTime('2026-01-15T23:30:00Z')` → 16. 1. 2026 0:30.

### H2 · Sjednotit formát peněz a telefonu (#13, menší)
- Peníze: seznam faktur 0 desetinných míst (`app/dashboard/faktury/page.tsx:35-37`), detail 2 (`[id]/page.tsx:27-29`), portál podle částky (`lib/portal/format.ts:6-19`).
- Telefon: admin převede „0777 123 456" na `+420777123456` (`lib/contacts/normalize.ts`), Workspace vrátí `null` (`lib/ws/bookings.ts:467-473`: po odstranění mezer zbude 10 číslic s nulou na začátku).
- **Oprava:** jedna čistá funkce pro formát peněz (admin + portál) a pro Workspace převzít pravidlo vedoucí nuly. Ve Workspace platí oddělení kódu (kopie do `lib/ws/`), ne import z adminu.

---

## I · Dokumentace a paměť

### I1 · Opravit zastaralé údaje, které svádějí agenty (#15)
Každý bod je jeden až dva řádky:
- **NextAuth a bcrypt** (dnes Supabase Auth + TOTP, R-105): `AGENTS.md` (oddíl Kontext), `CLAUDE.md:20`, `docs/AGENTS-REFERENCE.md:88,109,160,196,291,293,319,664`, `docs/admin/AGENTS-ADMIN.md:29,345,347,352,390,397,487,1305,1309,1336`. K R-001 doplnit „Upřesněno: R-105".
- **Gmail SMTP a „Resend jen kvůli waitlistu"** (dnes Resend, R-116): `memory/memory.md` otevřený problém „Resend jen kvůli waitlistu" uzavřít, bod „Odeslání faktury … Gmail SMTP" opravit, k R-004 doplnit „Nahrazeno: R-116". `docs/AGENTS-REFERENCE.md:109,200`, `docs/admin/AGENTS-ADMIN.md:30,391,1291`, komentář `lib/web-leads.ts:130`.
- **R-056** (`legacy-peer-deps` kvůli next-auth): doplnit stav podle J2.
- **Odkazy na smazané soubory:** `memory/index.md` (`lib/admin/completed.ts`, `components/CostsManager.tsx`, `app/block-templates-actions.ts`, `app/project-blocks-actions.ts`, `ProjectBlockList.tsx`; řádek „Šablony webu" smazat celý). `docs/admin/AGENTS-ADMIN.md:416` (`app/completed-actions.ts` → `closed-actions.ts`) a `:447` (`lib/web-booking.ts` → `lib/web-leads.ts`).
- **`.claude/security/STATE.md`:** `:114` („model nekoná" → vratné akce běží samy, #032), `:127` (NextAuth a zámek → Supabase + TOTP, #029/#030), `:222` (Clerk na `/klient` → Supabase, #031). Pak sync do `.agents/`.
- **`memory/memory.md` Aktuální stav:** snímek „produkce běží od 2026-11-14 na `8210f04`" přepsat na dnešek.
- **`docs/klientsky-prostor/KONVERZE-PLAN.md:3`** („nic z toho není v kódu") a řádek KV01a: landing s formulářem je na produkci od 2026-11-21.
- **Ověření:** `grep -rn "NextAuth\|getServerSession\|ADMIN_PASSWORD_HASH" AGENTS.md CLAUDE.md docs/AGENTS-REFERENCE.md docs/admin/AGENTS-ADMIN.md` → jen historické zmínky s odkazem na R-105. Každá cesta v `memory/index.md` existuje.

### I2 · Zmenšit paměť načítanou do každého sezení (#20, čeká na R6)
- **Problém:** `memory/memory.md` má 2449 řádků (~300 KB) a `CLAUDE.md:10` ho importuje do každého sezení. Pravidlo §4 říká ~400 řádků a changelog jen za poslední den.
- **Návrh:** changelog starší než poslední den přesunout do `memory/archiv/2026-11.md`. Rozhodnutí přesunout do `memory/rozhodnuti.md` (mimo import) a v `memory.md` nechat jednořádkový rejstřík (R-číslo, název, odkaz). Upravit `memory/pravidla.md` a `memory/index.md`.

---

## J · Závislosti

### J1 · Sladit Chromium s puppeteerem (#21)
- **Problém:** `@sparticuz/chromium` 149 (`package.json:36`), ale `puppeteer-core` 25.16.0 cílí Chrome 156 (`node_modules/puppeteer-core/lib/puppeteer/revisions.js:10`). PDF faktur, předávacích dokumentů a exportů (`lib/invoice-pdf/render.ts:168-172`) stojí na kompatibilitě přes sedm verzí a rozsah `^` ji může příští aktualizací rozbít.
- **Oprava:** podle tabulky kompatibility `@sparticuz/chromium` připnout obě verze přesně (bez `^`), nebo zvednout chromium na 156. Nová verze = záznam do paměti (R-053).
- **Ověření:** PDF faktury na Preview (Chromium z `@sparticuz` běží jen na Linuxu, lokálně se to neověří).

### J2 · Odstranit `legacy-peer-deps` (#22)
- **Problém:** `.npmrc:1-3` ho zdůvodňuje balíčkem next-auth, který v repu ani v locku není (R-105). Vypíná kontrolu peer závislostí všem balíčkům. `npm ls --all` dnes žádný neplatný peer nehlásí.
- **Postup:** na větvi řádek smazat, `npm install`, `npm ci`, build na Preview. Při ERESOLVE vyřešit `overrides` u jednoho balíčku, nebo vrátit. Komentář s `min-release-age` zůstává.

### J3 · `react-hook-form` jen kvůli jednomu formuláři (#34, nízká priorita)
- `components/BookingModal.tsx:5-6` je jediné použití `react-hook-form` a `@hookform/resolvers`. Přepsat na vzor ostatních formulářů a obě závislosti odebrat. Týká se veřejné rezervace na `/p`, takže ručně ověřit.

### J4 · Jedna cesta pro Resend, pryč s Gmailem (#30, čeká na R7)
- Resend se volá třikrát jinak: `lib/admin/vizeon-mail.ts` (fetch), `lib/ws/email/transport.ts:43-46` (SDK), `app/dashboard/startup/startup-actions.ts:340-353` (SDK). Záloha Gmail SMTP (`lib/email.ts:14-25,76-91`) nefunguje od 2026-08.
- Sjednotit adaptér pro admin (Workspace si nechá svůj, R-027). Po R7 smazat Gmail zálohu, `nodemailer` a `@types/nodemailer`, Gmail proměnné z `.env.example` a připomenout Vercel.

---

## K · Technický dluh (až zbude čas)

### K1 · Odklad kvůli „Zpět" se zápisem do databáze (#31)
- `after()` + uspání 13–23 s bez zápisu záměru: `app/actions.ts:374-376`, `app/portal-actions.ts:248,271-275`, `app/portal-admin-actions.ts:253`, `app/closed-actions.ts:100`, `app/phases-actions.ts:160`, `lib/admin/invoice-drafts.ts:298`. Když funkce skončí, dotazník ani upozornění na nízké hodnocení neodejdou nikdy (`lib/admin/surveys.ts:173-179` bere jen `survey_requested_at IS NOT NULL`).
- Vzor: fronta Workspace (`lib/ws/email/notify.ts`). Zapsat `send_after` do DB, `after()` jen zkusí doručit a denní cron dožene zbytek. Nová migrace.

### K2 · Pojistky pro migrace, které už na produkci jsou (#32)
- **Hned a malé:** `lib/portal/money.ts:40,169` a `lib/portal/overview.ts:54` polykají i `42501` (chybějící GRANT), takže rozbité právo `portal_app` ukáže klientovi prázdné peníze bez logu. `42501` přestat tolerovat.
- **Postupně:** 56 pojistek ve 38 souborech (`lib/admin/ledger.ts:7-20` kvůli 109 atd.). Pozor: testovací Neon `rd-test` nemá všechny admin migrace (106), nejdřív ho dorovnat.

### K3 · Čtení dat ven z `'use server'` (#33)
- Funkce `get*` v souborech `'use server'` (např. `app/dashboard/finance/invoice-actions.ts`, `finance-actions.ts`) importují serverové komponenty (`components/admin/project-detail-view.tsx:38,40,613`). Každé čtení je tak i veřejný POST endpoint a nejde dávkovat. Přesunout do `lib/admin/*.ts` (vzor `lib/admin/invoices.ts`), v `'use server'` nechat jen zápisy.

---

## Směr produktu (nejsou úkoly, jen návrhy k rozhodnutí)

1. Karta „Přes web vám napsalo N lidí" v klientském prostoru (KV03). Data už načítá `lib/portal/overview.ts`.
2. Skript „kandidáti na ZakazIQ" (KV02): hotový web + poptávky za 30 dní + NPS bez 0–6.
3. E-maily a pruh zkušební doby (KV05). Nasadit až se Stripe live.

Podrobnosti v [`README.md`](README.md) → Kam projekt posunout.

## Stav

| Balík | Úkoly | Stav | Commit | Poznámka |
|---|---|---|---|---|
| A | A1–A3 | HOTOVO | `9ab4191` | CI na `main` zezelená až po sloučení |
| B | B1 | HOTOVO | `d7c30ec` | Preview se session `aal1` neověřené |
| C | C0–C3 | ČÁSTEČNĚ | `18783c1` | hotovo vše kromě částí čekajících na R1 (stav „Zaplaceno" = Peníze dorazily, smazání doplatku při odškrtnutí) |
| D | D1–D2 | ČEKÁ (R2) | | |
| E | E1–E7 | ČÁSTEČNĚ | `11ac89c` | E1, E3, E4, E6, E7 hotové; E2 čeká na R3, E5 na R4 |
| F | F1–F5 | ČÁSTEČNĚ | `95c0a2a` | F1–F4 hotové (DECISIONS #052), F1: otočit heslo (R5); F5 zatím ne (riziko rozbití nahrání faktury) |
| G | G1–G3 | ČÁSTEČNĚ | `60b1d78` | G1 hotové; G2, G3 TODO |
| H | H1–H2 | ČÁSTEČNĚ | `60b1d78` | H1 hotové; H2 TODO |
| I | I1–I2 | ČÁSTEČNĚ | `983100f` | I1 hotové; I2 čeká na R6 |
| J | J1–J4 | ČÁSTEČNĚ | `da1fe04` | J1 jen připnutí verzí (Chromium 156 chce ověření PDF na Preview); J2, J3 TODO; J4 čeká na R7 |
| K | K1–K3 | TODO | | |
