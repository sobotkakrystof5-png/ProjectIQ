# S02 — Bezpečnostní základ (kompletní implementace web-security-setup)

## Cíl
Celé repo (admin, Workspace, landing page) má bezpečnostní základ podle skillu
**`web-security-setup`** a jeho paměť v `.claude/security/`, zapsanou i v `CLAUDE.md` a `AGENTS.md`.

## Než začneš
Rituál začátku (`zakaziq-memory`). Načti `web-security-setup` a `web-security-memory` celé
včetně referencí a šablon. Pokud `.claude/security/STATE.md` existuje, není to první setup:
přečti ho a jen doplň mezery.

## Situace (pro krok 1 skillu)
- Hosting: **Vercel** (`vercel.json` existuje, jsou v něm crony), framework **Next.js 14 App Router**.
- Integrace pro CSP: Google Fonts přes `next/font` (self-hosted, nic externího), **Clerk**
  (skripty, frame a API vlastní domény Clerku), **Stripe** (Checkout přesměrování, js.stripe.com,
  frame), **Resend** (jen server), Neon (jen server), Anthropic API (jen server, AI přepis faktur),
  TradingView widget v admin Hubu (ověř v `components/TradingViewChart.tsx`), widget
  ZakazIQ vkládaný na **cizí** weby (`/embed/[slug].js` — vlastní CORS a CSP, viz níže).
- Data: osobní údaje zákazníků firem, faktury, přihlášení, platby přes Stripe (karty nikdy
  u nás). Zapiš do threat modelu v `.claude/security/STATE.md`.
- Fáze: admin běží v produkci → **CSP nejdřív Report-Only** pro celé repo; pro nové cesty
  (`/w`, `(marketing)`) můžeš zvážit enforcing hned, rozhodnutí zapiš do `.claude/security/DECISIONS.md`.

## Kroky
1. Proveď kroky 1–6 skillu `web-security-setup` pro Vercel + Next.js (nonce middleware pro
   `script-src` se `strict-dynamic`, protože Clerk a Stripe vkládají skripty). Middleware
   slučuj s budoucím `middleware.ts` (Clerk + NextAuth): připrav ho tak, aby S07 jen přidal Clerk.
2. Hlavičky, které nesmí rozbít embed: objednávací stránka `/r/[slug]` a widget se vkládají
   na weby klientů → pro ně `frame-ancestors` podle `web_integrations.allowed_origins`
   (zatím jen připravit funkci, data přijdou v S11) a CORS jen pro `/api/public/v1/*`.
3. `.gitignore`, `security.txt` (s `Expires`), CI workflow, DNS doporučení (SPF/DKIM/DMARC
   pro doménu, ze které poletí e-maily přes Resend) do `.claude/security/STATE.md` jako otevřené položky.
4. Do `AGENTS.md` → B13 Bezpečnost vlož plná pravidla ze šablony skillu (nahraď minimum).
   Do `CLAUDE.md` vlož krátký bezpečnostní blok na konec.
5. Ověř, že admin konzole funguje (přihlášení, dashboard, TradingView, PDF faktur, portál
   `/p/[token]`) a v konzoli prohlížeče zapiš CSP hlášení do `CSP-LOG.md`.

## Hotovo, když
- Hlavičky nasazené (CSP Report-Only kde je třeba), `.claude/security/` kompletní
  (`STATE.md`, `DECISIONS.md`, `CSP-LOG.md`, `AUDIT-LOG.md`).
- `AGENTS.md` → B13 obsahuje plná pravidla, `CLAUDE.md` odkaz.
- Build, testy a admin fungují.

## Konec sezení
`zakaziq-memory` → Konec sezení (bezpečnostní detaily jsou v `.claude/security/`, do
`memory/memory.md` jen odkaz). Commit `security: základní hlavičky a paměť`.
