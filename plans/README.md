# Audit ZakazIQ (skill `improve`)

> Audit celého repa skillem [`shadcn/improve`](https://github.com/shadcn/improve) (uživatelská instalace `~/.claude/skills/improve/`, R-080).
> **Datum:** 2026-11-24 · **Commit:** `04941fe` · **Úroveň:** `standard` (4 subagenti jen pro čtení, všech 9 kategorií).
> Každý nález níž jsem otevřel a přečetl sám; čísla řádků platí pro `04941fe`.
> **Plány zatím nejsou napsané** — čeká se na výběr (Kryštof). Až budou, přibudou sem jako `001-*.md` a tabulka stavu dole.

## Výchozí stav ověření

| Kontrola | Výsledek |
|---|---|
| `npx tsc --noEmit` | 0 chyb |
| `npm audit` (vše i `--omit=dev`) | 0 zranitelností |
| `npm test` lokálně | 1753 prošlo, 3 selhaly: `ws-email` (pevné datum) a dva časové limity pod zátěží (`admin-ai-asistent-crm`, `admin-hovory-asistent`) |
| CI `ci` na `main` | **červená od 2026-11-17** — 37 neúspěchů, poslední úspěch 2026-11-16 18:17 UTC; teď ji drží jen `ws-email` |
| CI `security` na `main` | zelená |

## Nálezy podle priority (přínos ÷ práce, s jistotou)

| # | Nález | Kategorie | Dopad | Práce | Riziko opravy | Důkaz |
|---|---|---|---|---|---|---|
| 1 | CI na `main` je 8 dní červená kvůli testu s pevným datem; regrese pak nikdo nevidí | testy | vysoký | S | nízké | `lib/ws/__tests__/ws-email.test.ts:377-391`, `gh run list` |
| 2 | Druhý faktor (TOTP) hlídá jen layout; proxy pustí session `aal1` a 31 z 36 stránek adminu přihlášení samo nekontroluje | bezpečnost | vysoký | S–M | nízké | `lib/supabase/proxy.ts:49-63`, `proxy.ts:81-90`, `app/dashboard/layout.tsx:10-11`, Next docs `authentication.md:1360` |
| 3 | „Peníze dorazily" po zaplacené faktuře doplatek nezapíše — příjem z faktury vypadá jako hotový doplatek; v ledgeru i daňovém základu chybí zbytek | správnost (peníze) | vysoký | S | nízké | `app/actions.ts:443-462`, `lib/invoices.ts:349-361` |
| 4 | `remainingSql` ignoruje `paid` (SQL kopie v migraci 122 ne) → u zaplacené zakázky „Hotovo" vznikne koncept faktury na celou cenu; test rozdíl maskuje | správnost (peníze) | vysoký | S | nízké | `lib/admin/project-payments.ts:75-82`, `migrations/122_portal_penize_faktury.sql:125-129`, `lib/admin/invoice-drafts.ts:251-258`, `lib/__tests__/kp13-penize-faktury.test.ts:80` |
| 5 | Přepnutí „Fakturováno na IČO" přepíše `declared` i u příjmu z vystavené faktury → doklad v nepřiznané linii | správnost (daně) | střední–vysoký | S | nízké | `app/actions.ts:392-398`, `lib/invoices.ts:291,302,339` |
| 6 | Asistent smí sám (`auto`) změnit e-mail/telefon kontaktu; od R-141 se to propíše do budoucích schůzek a připomínky/SMS odejdou jinam | bezpečnost | střední–vysoký | S | nízké | `lib/ai/action-policy.ts:21-33`, `lib/admin/suggestion-apply.ts:513-528`, `lib/admin/contact-sync.ts` |
| 7 | Rezervace z vizeon.cz/alteno.cz: dva samostatné INSERTy → při obsazeném termínu zůstane v Poptávkách zakázka bez termínu (a po opakování duplicita) | správnost | střední | S | nízké | `lib/web-leads.ts:116-127,166-167` |
| 8 | Změna času v Hovorech posune událost mimo `updateCalendarEvent` → Google, připomínky ani konzultace se nepřesunou (porušuje R-137) | správnost | střední–vysoký | M | střední | `app/calls-actions.ts:144-147`, `migrations/105_propojeni_kalendar_hovory.sql:156-165` |
| 9 | Smazání kontaktu v Hovorech: tři samostatné dotazy, maže i událost konzultace, schůzku v Googlu nechá | správnost | střední | S | nízké | `app/calls-actions.ts:224-234` vs `app/calendar-actions.ts:340-378` |
| 10 | Connection string databáze waitlistu leží nešifrovaný v DB a chodí do prohlížeče; AUDIT-LOG tvrdí opak | bezpečnost | střední | S | nízké | `app/dashboard/startup/startup-actions.ts:42,64,150`, `components/StartupProjectEditor.tsx`, `.claude/security/AUDIT-LOG.md:294` |
| 11 | Chat se každých 10 s celý obnoví: každý tik zapíše `last_read_at = now()`, a tím změní otisk | výkon | střední | S | nízké | `components/chat/chat-live.tsx:40-50`, `migrations/124_chat_s_klientem.sql:295-318`, `lib/admin/chat.ts:107-111` |
| 12 | Limit na IP: předbrána počítá IPv6 po /64, databázový limit po celé adrese → přesný limit jde obejít | bezpečnost | střední | S | nízké | `lib/api-rate-limit.ts:43-57` (Workspace `lib/ws/intake/rate-limit.ts:83-84` to má správně) |
| 13 | `formatDate`/`formatDateTime` bez `timeZone: 'Europe/Prague'` — na serveru (UTC) ukazují čas o 1–2 h vedle, ~90 volání | správnost | střední | S | nízké | `lib/utils.ts:17-35`, `app/dashboard/page.tsx:226`, `app/dashboard/faktury/[id]/page.tsx:388` |
| 14 | Asistentovo „zapamatuj si" je `auto` a ukládá se jako potvrzené na 3 roky do každého promptu → podstrčený text přežije chat | bezpečnost | střední | S–M | nízké | `lib/ai/action-policy.ts:31`, `lib/admin/suggestion-apply.ts:653-667`, `lib/admin/memory/store.ts:114-116,165-172` |
| 15 | Zastaralá dokumentace svádí agenty: NextAuth a bcrypt v AGENTS/CLAUDE/referencích, „Gmail SMTP", „Resend jen kvůli waitlistu", 7 odkazů na smazané soubory, STATE.md („model nekoná", NextAuth, Clerk na `/klient`) | dokumentace | střední | S | nízké | `AGENTS.md` (kontext), `CLAUDE.md:20`, `docs/AGENTS-REFERENCE.md:88,109,160,200,293,319,664`, `memory/memory.md:1941`, `memory/index.md:61,86,87`, `.claude/security/STATE.md:114,127,222` |
| 16 | Denní cron (7:00 UTC) s okny 23–25 h a 1–3 h mine většinu připomínek; příznak „odesláno" se nastaví před odesláním a `false` z e-mailu se počítá jako úspěch | správnost | střední | M | nízké | `vercel.json:4`, `app/api/cron/send-reminders/route.ts:151-195,266-275`, `lib/email.ts:66-91` — ZNÁMÉ, rozšíření |
| 17 | Brána na IP v `proxy.ts` neběží pro `/api/*` ani `/embed/*` (matcher je vynechává); STATE.md slibuje „120 API za 10 s"; `/embed` nemá žádný limit ani CDN cache | bezpečnost | střední | S | střední | `proxy.ts:133-139`, `.claude/security/STATE.md:157`, `app/embed/[file]/route.ts:27-45` |
| 18 | Route „Schválit a poslat" (vystaví číslo a pošle) nemá žádný test; sesterská route ano | testy (peníze) | střední | S | nízké | `app/api/invoices/drafts/[id]/send/route.ts`, vzor `app/api/invoices/[id]/email/__tests__/email-route.test.ts` |
| 19 | CI se spouští jen na `main`, `workspace`, `ws/**` — větve `admin/**`, `klient/**`, `auth/**` se testují až po sloučení do produkce | DX | střední | S | nízké | `.github/workflows/ci.yml:9` |
| 20 | `memory/memory.md` má 2449 řádků (~300 KB) a importuje se do každého sezení; pravidlo říká ~400 | DX | střední | M | nízké (chce rozhodnutí) | `CLAUDE.md:10`, `memory/pravidla.md` §4 |
| 21 | `@sparticuz/chromium` 149 vs `puppeteer-core` 25.16 (cílí Chrome 156) — PDF stojí na kompatibilitě přes 7 verzí, `^` ji může rozbít | závislosti | střední | S | nízké | `package.json:36,50`, `node_modules/puppeteer-core/lib/puppeteer/revisions.js:10` |
| 22 | `.npmrc` `legacy-peer-deps=true` kvůli next-auth, který v repu není (R-105); vypíná kontrolu peer závislostí všem | závislosti | nízký–střední | S | střední | `.npmrc:1-3`, R-056 bez „Nahrazeno" |
| 23 | Převzetí firmy od asistenta: kontrola a INSERT zvlášť → dvojklik založí dva řádky v Hovorech | správnost | nízký | S | nízké | `app/outreach-actions.ts:38,61-83` |
| 24 | Detail zakázky: výchozí záložka zase ~10 požadavků ve třech vlnách, test strop nehlídá | výkon | střední | M | střední | `components/admin/project-detail-view.tsx:272-279`, `components/admin/memory/memory-card.tsx:54-60` |
| 25 | Uložení zakázky: 5–11 požadavků za sebou bez transakce; pád v půlce = zakázka bez příjmu | výkon / správnost | střední | M | střední | `app/actions.ts:322-462` |
| 26 | Minutový běh připomínek zamkne 10 zpráv najednou, 10 × 10 s timeout > 60 s → zbytek skončí „nejisté, jestli odešla" | správnost | nízký | S | nízké | `app/api/cron/meeting-reminders/route.ts:16,29`, `lib/admin/meeting-reminders.ts:269-289` |
| 27 | `pragueWallClockToISO` posune 1:00–1:59 o hodinu ve dny změny času (ručně přepočteno pro 29. 3. a 25. 10. 2026) | správnost | nízký | S | nízké | `lib/prague-time.ts:33-42` |
| 28 | Globální `bodySizeLimit: '5mb'` platí i pro veřejné server actions bez přihlášení | bezpečnost | nízký | M | střední | `next.config.mjs:88-93` |
| 29 | E-maily příjemců a celé objekty chyb v runtime logách | bezpečnost (GDPR) | nízký | S | nízké | `app/dashboard/startup/startup-actions.ts:382,389`, `app/portal-actions.ts:348,382`, `lib/email.ts:89` |
| 30 | Resend se volá třemi cestami a záloha Gmail SMTP (nefunkční od 2026-08) drží `nodemailer` v repu | technický dluh | nízký | M | střední | `lib/admin/vizeon-mail.ts`, `lib/ws/email/transport.ts:43-46`, `app/dashboard/startup/startup-actions.ts:340-353`, `lib/email.ts:14-25` |
| 31 | Odklad kvůli „Zpět" přes `after()` + uspání 13–23 s bez zápisu do DB — když funkce skončí, dotazník ani upozornění neodejdou nikdy | technický dluh | nízký–střední | M | střední | `app/actions.ts:374-376`, `app/portal-actions.ts:248,271-275`, `app/portal-admin-actions.ts:253` |
| 32 | 56 pojistek „migrace ještě neběžela" ve 38 souborech; `lib/portal/*` polyká i `42501` (chybějící GRANT se tváří jako vypnutá funkce) | technický dluh | nízký–střední | L (po částech) | střední | `lib/admin/ledger.ts:7-20`, `lib/portal/money.ts:40,169`, `lib/portal/overview.ts:54` |
| 33 | Čtení dat v `'use server'` souborech, které importují serverové komponenty → každé čtení je i veřejný POST endpoint, nejde dávkovat | technický dluh | nízký | M | nízké | `app/dashboard/finance/invoice-actions.ts`, `components/admin/project-detail-view.tsx:38,40,613` |
| 34 | `react-hook-form` + `@hookform/resolvers` slouží jedinému formuláři | závislosti | nízký | S | nízké | `components/BookingModal.tsx:5-6` |

**Pořadí a závislosti:** #1 jako první (bez zelené CI se nedá věřit ničemu dalšímu). #3, #4 a #5 sahají na stejný výpočet doplatku a ledger — jeden plán, nejdřív test, který dnes padá (`kp13-penize-faktury` bez masky `CASE WHEN p.paid`). #8 a #9 jsou tatáž třída (Hovory obcházejí kalendář) — jeden plán. #2 před pilotem klientského prostoru (KP10). #15 a #20 spolu (úklid paměti), #15 hned, #20 až po rozhodnutí o pravidle §4.

## Kam projekt posunout (směr)

Návrhy, ne problémy; všechny vycházejí z `docs/klientsky-prostor/KONVERZE-PLAN.md` a dat, která už v kódu jsou.

1. **Karta „Přes web vám napsalo N lidí" v klientském prostoru (KV03, P3/P6).** Data už `lib/portal/overview.ts` načítá (`webLeads`), souhrn je hotový v `lib/client-web/stats.ts:105`. Jediná páka konverze, kterou neblokuje Stripe live ani Supabase F2. Odhad M (tabulka odkladů `member_prompts` + export/výmaz/retence).
2. **Seznam kandidátů na ZakazIQ jako skript (KV02, A1).** Jeden SQL dotaz: hotový web + poptávky za 30 dní + poslední NPS bez 0–6 (D-KV6). Najde prvních 5 klientů pro osobní převod (D-KV1). Odhad S jako `scripts/`, admin až s výslovným zadáním.
3. **E-maily a pruh zkušební doby (KV05, W1/W2).** `lib/ws/email/catalog.ts` nemá žádný typ o zkušební době, data (`trialing`, `current_period_end`) i denní cron existují. Nasadit až s KV01 (Stripe live); teď jen návrh typů zpráv.

Pozor: hlavička `KONVERZE-PLAN.md:3` („nic z toho není v kódu") a řádek KV01a jsou zastaralé — landing s formulářem je na produkci od 2026-11-21.

## Zváženo a zamítnuto (neopakovat příště)

- **Známé otevřené problémy** z `memory/memory.md` oddíl 3 se znovu nehlásí (testy s pevnými daty jako obecný bod, PGlite timeouty, `notFound()` vrací 200, chybějící lint a monitoring, růst JS adminu, Finance 9 kol, Inter z Google Fonts). Výjimky výš jsou označené „ZNÁMÉ, rozšíření" nebo přinášejí nový důkaz (#1 — test už reálně padá a drží CI červenou).
- **Přijatá rizika** z `.claude/security/DECISIONS.md` (admin rolí vlastníka s BYPASSRLS, CSP adminu Report-Only, Vercel WAF, DNS apexu, Hobby bez DPA) — rozhodnutá, nehlásí se. #6, #14 a #17 se hlásí proto, že kód se s rozhodnutím rozchází (#032/#034, #050).
- `qrcode` vedle `qrcode.react` — záměr (R-064).
- `next/dynamic` v adminu — zamítnuto měřením (R-094).
- Peníze, oddělení účtů, webhooky Stripe/Clerk a `contact-sync` (R-141) mají skutečné testy nad PGlite — bez nálezu.
- `.env.example` sedí s kódem (chybí jen proměnné ve vygenerovaných ukázkách pro weby klientů).
- `void createNotification` v `send-reminders` — známé (Otevřené problémy), cron na `Promise.allSettled` čeká.
- „Instance drží 15–20 s" u #31 — na Hobby s Fluid compute je limit běhu 300 s, takže zabití uprostřed je méně pravděpodobné, než subagent odhadl; nález zůstává kvůli chybějící pojistce, ne kvůli času.
- V repu se nenašel žádný text, který by se snažil dávat agentovi pokyny.

## Co se neprošlo

Do hloubky ne: Workspace mimo příjem poptávek, rezervace a peníze (`lib/ws/calendar*`, loyalty, gdpr), server actions v `app/w/**` jednotlivě, RLS politiky v migracích (jen `search_path` u SECURITY DEFINER), Clerk a Resend webhook, `lib/ai/` mimo třídy akcí a paměť, `lib/ws/bookings.ts`, `lib/admin/suggestion-apply.ts` mimo dvě akce, klientské komponenty, velikost balíčků (build se nespouštěl), indexy proti skutečnému schématu Neonu, crony `ws-gdpr`, `ws-segments`, `client-retention`. Nic se neověřovalo v prohlížeči ani na produkci (#2 je potřeba potvrdit požadavkem se session `aal1` na Preview).

## Plány

Všechny nálezy jsou převedené na pracovní seznam [`ukoly-z-auditu.md`](ukoly-z-auditu.md) (balíky A–K, rozhodnutí R1–R7, stav). Samostatné plány `NNN-*.md` pro levnější model se zatím nepsaly.

| # | Plán | Nález | Stav |
|---|---|---|---|
| — | [`ukoly-z-auditu.md`](ukoly-z-auditu.md) | všech 34 | TODO, začít balíkem A |
