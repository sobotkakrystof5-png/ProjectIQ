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

## Čeká (zapsat jako vN při přidání)
- Clerk produkční instance (`clerk.zakaziq.cz`): host se změní sám s klíčem, ověřit konzoli po nasazení. Kdyby se Turnstile nebo Google přihlášení zasekly na CSP, doplnit jen to, co ukáže konzole.
- S08 Stripe Checkout: přesměrování, pravděpodobně nic; kdyby redirect po odeslání formuláře narazil na `form-action`, přidat `https://checkout.stripe.com`.

## Odebrané
(zatím nic)
