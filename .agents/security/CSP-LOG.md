# CSP changelog

> Každá změna Content-Security-Policy a funkce, která ji vyžádala.
> Smysl: umět s jistotou odebrat zastaralý zdroj.
> Kód politiky: `lib/security/csp.ts` (profily `admin` a `workspace`).

Formát:

```
## vN — YYYY-MM-DD
Změna: direktiva + hodnota přidaná/odebraná
Kvůli: konkrétní funkce
Ověřeno: stránky, prohlížeče, konzole čistá ano/ne
```

---

## Stav před v1 (zděděno)
Do 2026-10-08 žádná CSP. Ostatní hlavičky (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS) v `next.config.mjs` od 2026-06-16.

## v1 — 2026-10-08
Změna: první politika, nonce + `strict-dynamic`. Admin profil Report-Only, Workspace (`/w`, `/r`, `/z`) vynucená.

Základ (oba profily):
```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none';
form-action 'self'; script-src 'self' 'nonce-…' 'strict-dynamic' https:;
style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:;
connect-src 'self'; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'
```
+ `upgrade-insecure-requests` jen vynucená; dev `'unsafe-eval'` a `connect-src ws: wss:` (HMR).

Zdroje navíc a proč:

| Zdroj | Profil | Kvůli |
|---|---|---|
| `style-src https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com` | admin | Inter přes `@import` v `app/globals.css` |
| `frame-src https://www.tradingview-widget.com` | admin | graf TradingView v `/hub/finance` (`components/TradingViewChart.tsx`). Skript z `s3.tradingview.com` pouští `strict-dynamic` (vkládá ho náš skript) |
| `object-src 'self'`, `frame-src 'self'` | admin, jen `/dashboard/faktury/*` | náhled PDF faktury v `<object>` — Chrome ho hlásí pod `frame-src` |
| `frame-ancestors 'self'` (+ domény klienta od S11) | workspace, `/r/*` | objednávací stránka vkládaná do iframe |
| `style-src 'unsafe-inline'` | oba | DECISIONS #002 |

Ověřeno (produkční build lokálně, headless Chrome 2026-10-08, přihlášený admin):
- Bez hlášení: `/dashboard`, `/dashboard/{calendar,calls,dokoncene,hodnoceni,naklady,faktury,sablony,vizeon,notifications,profil}`, detail zakázky + šablona, detail faktury (PDF se načte, 200), `/alteno`, `/alteno/rezervace`, `/hub`, `/hub/{byznys,plany,projekty,school,sport,finance}` (TradingView iframe běží).
- `/login`: 14 hlášení `script-src` — stránka je statická, skripty bez nonce (DECISIONS #001). Brání vynucení admin CSP.
- `/p/[token]`: 1 hlášení `unsafe-eval` — sonda `new Function("")` v Zod 4 (`allowsEval`), chycená v try/catch, Zod pak jede bez JIT. Funkčně nic. Ve Workspace řešit `z.config({ jitless: true })`.
- `/w/_design` (dev, vynucená): stránka funguje včetně hydratace (přepnutí tmavého režimu); zablokovaný jen adminův `@import` Inter z `globals.css` (DECISIONS #003).
- Odebráno při ladění: `frame-src https://s.tradingview.com` — iframe z něj nechodí.
- Safari zatím neověřeno (není tu) — udělat při přepnutí adminu na vynucenou.

## v2 — 2026-10-08
Landing page do vynucené CSP (DECISIONS #007, R-033): `/`, `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva` jako přesné cesty v `ENFORCED_PATHS` (`lib/security/csp.ts`, test). Profil `workspace`, žádný nový zdroj. Layout `app/(marketing)` je `force-dynamic`. Ověřeno 2026-10-08 v headless Chromu (produkční build, 390–1440 px, `/`, `/podminky`, `/w/registrace`): stránky i hydratace fungují, jediné hlášení je zablokovaný adminův `@import` Inter z `globals.css` (jako na `/w`, otevřený problém v `memory/memory.md`). Safari neověřeno.

## v3 — 2026-10-09
Změna: jen na `/w/*` (profil `workspace`): `connect-src https://<Frontend API Clerku>`, `img-src https://img.clerk.com`, `frame-src https://challenges.cloudflare.com`. `script-src` beze změny.
Kvůli: přihlášení a registrace přes Clerk (S07). Host Frontend API se bere z `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`clerkFrontendApiHost()`, base64 `<host>$`, kontrola tvaru hostu, neplatný klíč = nic) — dev `ultimate-chimp-4657.clerk.accounts.dev`, produkce bude `clerk.zakaziq.cz`. Skript clerk-js jde z toho hostu s naším nonce (`ClerkProvider dynamic` čte `x-nonce`), Turnstile a chunky clerk-js pouští `strict-dynamic`. Turnstile (bot ochrana registrace) běží v rámečku z `challenges.cloudflare.com`. Telemetrie Clerku vypnutá (`telemetry={false}`), `clerk-telemetry.com` proto v politice není. Landing, `/r`, `/z` a admin Clerk nedostávají (test v `lib/security/__tests__/csp.test.ts`).
Ověřeno: produkční build lokálně, headless Chrome i Chrome 2026-10-09, `/w/prihlaseni` a `/w/registrace` na 390 a 1280 px — formuláře Clerku se vykreslí a hydratují, žádné hlášení CSP od Clerku. Jediné porušení zůstává adminův `@import` Inter (známé). Turnstile se v dev instanci nezobrazil (neověřeno v rámečku), přihlášení přes Google a ověření kódem neprošly ručně (zakládání účtu dělá Kryštof). Safari neověřeno.

## v4 — 2026-10-10
Změna: `frame-ancestors` na `/r/<slug>` = `'self'` + povolené domény byznysu (`web_integrations.allowed_origins`) místo jen `'self'`. Nový zdroj žádný, `script-src` beze změny.
Kvůli: vložení objednávací stránky do iframe na webu klienta (S11). Domény bere middleware přes `lib/ws/intake/embed-origins.ts` (SECURITY DEFINER `ws.business_by_public_slug`, cache 60 s v instanci, chyba DB nebo neznámý slug = jen `'self'`), každá prochází `normalizeOrigin` (jen `https://host[:port]`, bez wildcardu). Widget `/embed/*.js` a API `/api/public/v1/*` CSP nemají (běží na cizím webu / JSON).
Ověřeno: lokálně dev 2026-10-10 — `/r/ahoj` bez povolené domény `frame-ancestors 'self'`, s `https://example.com` `frame-ancestors 'self' https://example.com`; stránka v Chromu na 390 px funguje s vynucenou CSP. Produkční build a Safari neověřeno.

## v5 — 2026-10-17
Změna: CSP přepnuta do vynuceného režimu pro všechny cesty (`cspProfileFor()` vrací `mode: 'enforce'` i pro profil `admin`). Nový externí zdroj nepřibyl. `/login` dostal dynamický layout (`app/(auth)/login/layout.tsx`), aby Next.js připojil nonce ke skriptům.
Kvůli: S19 vyžaduje vynucenou CSP před spuštěním; předchozí blokace statického `/login` je odstraněna. Zásah do adminu je součástí výslovného zadání S19.
Ověřeno: CSP hlavičky Preview S19 obsahují `default-src`, `frame-ancestors`, `base-uri`, `form-action`, `object-src 'none'`; bez holého `unsafe-inline`, `unsafe-eval` a wildcard ve `script-src`. Chrome landing page se vykreslila a v zaznamenaných warn/error zprávách nebylo CSP porušení. Vercel Preview build READY. Safari, admin login a přihlášení Workspace neověřeny; Chrome konzole hlásila chybu konfigurace NextAuth. Produkce stále běží ze staršího `main` bez CSP.
Poznámka: výchozí statická 404 může být bez hydratace; viz DECISIONS #015. Do produkce nenasazovat, dokud se CSP neověří po deployi.

## v6 — 2026-11-01
Změna: cesty `/klient` (klientský prostor, KP05) dostaly profil `workspace` (vynucený) a stejné zdroje Clerku jako `/w`: `connect-src` Frontend API Clerku, `img-src img.clerk.com`, `frame-src challenges.cloudflare.com`. Nový externí host nepřibyl. `script-src` beze změny (nonce + strict-dynamic), žádné `unsafe-inline`/`unsafe-eval`, žádný wildcard. `Permissions-Policy` má `microphone=(self)` i na `/klient/*` (hlasový požadavek, DECISIONS #018).
Kvůli: přihlášení klientů přes Clerk, přehled zakázek a hlasový požadavek.
Ověřeno: testy `lib/security/__tests__/csp.test.ts` (profil, Clerk zdroje jen na `/w` a `/klient`, `/klientela` nechytá). Skutečné přihlášení přes Clerk na `/klient` v prohlížeči neověřeno.

## v7 — 2026-11-07
Změna: Clerk odebrán (R-080, DECISIONS #022). Pryč jsou Frontend API Clerku v `connect-src`, `img-src img.clerk.com` a `frame-src challenges.cloudflare.com` na `/w` a `/klient`. Nově jen `connect-src` = origin Supabase projektu (`supabaseOrigin(NEXT_PUBLIC_SUPABASE_URL)`, jen https bez cesty, jinak nic) na `/w`, `/klient` a `/login` — přihlašovací formuláře volají Supabase Auth z prohlížeče. Google přihlášení je přesměrování celé stránky. `script-src` beze změny, žádný nový skript ani rámeček, žádný wildcard.
Kvůli: přechod na Supabase Auth.
Ověřeno: `lib/security/__tests__/csp.test.ts` (Supabase jen na přihlašovacích cestách, landing, admin mimo `/login`, `/z` a `/r` bez Supabase; neplatná adresa nepustí nic). V prohlížeči neověřeno (Supabase projekt zatím neexistuje).

## v8 — 2026-11-07
Změna: `frame-src https://challenges.cloudflare.com` jen na přihlášení, registraci a obnově hesla (`/login`, `/w/prihlaseni`, `/w/registrace`, `/w/zapomenute-heslo`, `/klient/prihlaseni`, `/klient/registrace`, `/klient/zapomenute-heslo`) — rámeček Cloudflare Turnstile. Skript `challenges.cloudflare.com/turnstile/v0/api.js` vkládá náš skript s nonce, pouští ho `strict-dynamic` (žádný nový host ve `script-src`). `connect-src` Supabase navíc na `/dashboard/zabezpeceni` (správa 2FA admina z prohlížeče). QR kód 2FA je `data:` obrázek — `img-src data:` už byl.
Kvůli: R-081 (DECISIONS #023) — ochrana proti botům a dvoufázové ověření.
Ověřeno: `lib/security/__tests__/csp.test.ts` (Turnstile jen na přihlašovacích stránkách, ne na `/w/zabezpeceni`, landing, adminu ani `/r`; Supabase na `/dashboard/zabezpeceni`, jinde v adminu ne). V prohlížeči neověřeno (chybí klíč Turnstile).

## Čeká (zapsat jako vN při přidání)
- S08 Stripe Checkout: přesměrování, pravděpodobně nic; kdyby redirect po odeslání formuláře narazil na `form-action`, přidat `https://checkout.stripe.com`.

## Odebrané
(zatím nic)
