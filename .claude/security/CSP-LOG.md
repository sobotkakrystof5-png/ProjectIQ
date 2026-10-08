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

## Čeká (zapsat jako vN při přidání)
- S07 Clerk: domény instance (dev `*.clerk.accounts.dev` → konkrétní host, produkce `clerk.zakaziq.cz`), `img-src img.clerk.com`, případně Turnstile (`challenges.cloudflare.com`) — jen to, co ukáže konzole.
- S08 Stripe Checkout: přesměrování, pravděpodobně nic; kdyby redirect po odeslání formuláře narazil na `form-action`, přidat `https://checkout.stripe.com`.

## Odebrané
(zatím nic)
