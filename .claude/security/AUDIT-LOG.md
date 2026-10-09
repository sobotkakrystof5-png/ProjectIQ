# Audity a incidenty

> Jen historie. Audity, code review, incidenty, rotace klíčů.

Formát:

```
## YYYY-MM-DD — audit | review | incident
Spouštěč: deploy / měsíční / hlášení / alert
Rozsah: co se kontrolovalo
Výsledek: X OK / Y varování / Z chyb, nebo popis
Nálezy: skutečné nálezy
Opraveno: co se změnilo, commit
Zůstává: co zůstává a proč
```

---

## 2026-10-09 — review (S07, Clerk, registrace, nový byznys)
Spouštěč: skill `web-security-review` před commitem S07.
Rozsah: `middleware.ts` (Clerk jen `/w` a `/api/ws`, admin větev beze změny), `lib/security/csp.ts` (v3), `app/w/novy/actions.ts` (server action), `app/api/clerk/webhook/route.ts` + `lib/ws/clerk-webhook.ts`, `lib/ws/onboarding.ts`, `lib/ws/clerk-orgs.ts`, komponenty `/w`. gitleaks nad soubory commitu, grep na `innerHTML`/`dangerouslySetInnerHTML` a klíče v kódu, `npm audit --omit=dev`.
Výsledek:
- Vstupy: průvodce validuje Zodem na serveru (název 2–80 znaků, obor z výčtu), `account_id` generuje server, `userId` jen z `auth()`. Webhook: Svix podpis přes `verifyWebhook` (HMAC + časové razítko, test na podvržený podpis, cizí klíč, staré razítko), bez klíče 503, limit těla 256 kB, idempotence přes `ws.webhook_events`, do logu jen typ a id události.
- Dotazy jen parametrizované (`q`/`wsDb`), zápisy pod RLS se správným `app.account_id`; test „druhý účet nevidí nic z prvního“ i bez aplikačního filtru.
- Secrets: jen `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` do prohlížeče (publikovatelný); `CLERK_SECRET_KEY` čte jen serverový kód Clerku, `lib/ws/clerk-orgs.ts` má `server-only`. gitleaks bez nálezu. Klíče stažené `clerk env pull` do `.env.local` (gitignored), hodnoty se nikde nevypsaly.
- Admin: `/dashboard`, `/alteno`, `/hub` dál 307 na přihlášení NextAuth, `/login` 200 s Report-Only CSP, admin chunky bez Clerku.
- `npm audit --omit=dev`: 11, beze změny.
Nálezy: žádný k opravě. Přijato: `__session` bez HttpOnly (DECISIONS #009). Poznámka: limit těla webhooku kontroluje jen `Content-Length` (chunked tělo omezí až Vercel, 4,5 MB) — u podepsaného endpointu přijatelné.
Opraveno: —
Zůstává: produkční instance Clerku, endpoint webhooku a `CLERK_WEBHOOK_SECRET` (STATE → Otevřené položky).

## 2026-10-08 — review (S06, databáze a oddělení účtů)
Spouštěč: nové schéma `ws`, DB role, přístupová vrstva.
Rozsah: migrace 064–075, `scripts/ws-grants.sql`, `scripts/ws-create-role.js`, `lib/ws/{db,context}.ts`, testy v PGlite.
Výsledek: oddělení účtů ověřené automaticky na všech 30 tabulkách s daty účtu (čtení, změna, mazání, zápis s cizím `account_id`, cizí UUID přes cizí klíč); mutační kontrola — politika `USING (true)` test shodí.
Nálezy:
- Role z Neon konzole mají `neon_superuser` → `BYPASSRLS` (ověřeno na `neondb_owner`). Řešeno: role jen přes SQL skript, který na konci ověří, že RLS platí.
- `current_setting('app.account_id', true)` vrací po transakci `''` → `''::uuid` by shodil dotazy. Řešeno `NULLIF` v `ws.current_account()`.
- Kontrola cizích klíčů obchází RLS. Řešeno složenými klíči `(account_id, x_id)`.
Opraveno: vše výše před commitem „ws/db: schéma a oddělení účtů“.
Zůstává: migrace a role ještě nejsou na produkčním Neonu (STATE → Otevřené položky); přijatá rizika v DECISIONS #008.

## 2026-10-08 — audit (lokální, zavedení základu S02)
Spouštěč: zavedení bezpečnostního základu.
Rozsah: hlavičky přes `curl` na produkčním buildu (`next start`) pro `/login`, `/dashboard`, `/w/_design`, `/r/*`, `/p/[token]`, `/api/invoices/[id]/pdf`, `/embed/*`, `/api/public/v1/*`, `/.well-known/security.txt`; průchod 30 admin stránek v headless Chromu s CSP hlášeními; `gitleaks git` přes celou historii; kontrola trackovaných `.env*` souborů a `NEXT_PUBLIC_` proměnných; `npm audit --omit=dev`.
Výsledek: hlavičky odpovídají STATE.md na všech cestách; nonce na všech skriptech dynamických stránek; admin přihlášení beze změny (bez session 307 → `/api/auth/signin`, se session 200).
Nálezy:
- `/login` statický → skripty bez nonce (brání vynucení admin CSP).
- Sonda `unsafe-eval` ze Zod 4 na portálu (neškodná).
- `X-Frame-Options: DENY` platil i pro PDF faktury → náhled v `<object>` na detailu faktury v Chromu nejspíš nefungoval ani před S02 (neověřeno na produkci).
- gitleaks: 90 commitů, žádný únik. Trackované `.env.example` a `.env.local.example` obsahují jen prázdné hodnoty.
- `npm audit --omit=dev`: 11 zranitelností (1 critical `next` 14) — beze změny proti 2026-10-08 ráno.
- Bez `favicon.ico` (404 v konzoli) — kosmetické.
Opraveno: `X-Frame-Options: SAMEORIGIN` pro `/api/invoices/:id/pdf`; `poweredByHeader: false`; `.gitignore` na všechny `.env*` kromě vzorů, `*.key`, `*.p12`. Commit „security: základní hlavičky a paměť".
Zůstává: viz STATE.md → Otevřené položky (vynucení admin CSP, DNS, živý audit `security-check.sh` po nasazení).

## Incidenty

(zatím žádné)
