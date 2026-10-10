# Bezpečnostní rozhodnutí

> Jen přidávat. Každý vědomý kompromis s důvodem a datem revize.
> Přijaté riziko bez data revize je zapomenuté riziko.

Formát:

```
## NNN — krátký název
Datum: YYYY-MM-DD
Rozhodnutí: co platí
Důvod: proč, konkrétně
Zvažované alternativy: co ještě bylo na stole a proč prohrálo
Přijaté riziko: co je teď možné
Revize: YYYY-MM-DD nebo „když …"
```

---

## 001 — Základ zaveden, admin CSP Report-Only
Datum: 2026-10-08
Rozhodnutí: kompletní sada hlaviček v `next.config.mjs`, CSP s nonce v `middleware.ts`. Admin konzole (a všechno mimo `/w`, `/r`, `/z`) dostává CSP jen jako `Content-Security-Policy-Report-Only`.
Důvod: admin běží v produkci. `/login` a 404 jsou staticky předrenderované → jejich skripty nemají nonce a vynucená CSP by rozbila přihlášení. Ostatní admin stránky prošly bez hlášení (CSP-LOG v1).
Zvažované alternativy: vynutit hned a `/login` přepnout na dynamický — zásah do adminu, který zadání S02 nedovoluje bez souhlasu.
Přijaté riziko: na admin stránkách CSP po dobu Report-Only nic neblokuje.
Revize: do S19 (přepnout na vynucenou po souhlasu se zásahem do `/login`).

## 002 — style-src 'unsafe-inline'
Datum: 2026-10-08
Rozhodnutí: povolené inline styly ve všech profilech.
Důvod: Next.js vkládá kritické CSS inline; Framer Motion, Radix (popper) a sonner zapisují styly za běhu do atributu `style`. Bez toho se rozpadne layout i animace.
Zvažované alternativy: nonce na `<style>` — nepokryje atributy `style=""`, které píšou knihovny.
Přijaté riziko: CSS injection (exfiltrace přes selektory, překrytí UI). Skripty zůstávají zamčené, takže to neotevírá spuštění kódu.
Revize: když Next.js podpoří nonce pro styly a knihovny přestanou psát `style` atributy.

## 003 — Workspace (/w, /r, /z) má CSP vynucenou od začátku, layout /w je dynamický
Datum: 2026-10-08
Rozhodnutí: cesty Workspace dostávají `Content-Security-Policy` (vynucená). `app/w/layout.tsx` má `dynamic = 'force-dynamic'`, aby každá stránka dostala nonce. Landing page (`app/(marketing)`) zůstává zatím v Report-Only profilu — nemá stránky a sdílí kořen `/` s adminovým přesměrováním.
Důvod: nová část se staví do politiky, ne politika podle ní — mnohem levnější než dodatečně. Workspace je stejně dynamický (Clerk, data účtu), cena za `force-dynamic` je nulová.
Zvažované alternativy: hashe místo nonce (Next 14 je pro App Router neumí, inline skripty se mění s obsahem); Report-Only i pro Workspace (odkládá práci a nic nechrání).
Přijaté riziko: neexistující URL pod `/w` vrací statickou 404 bez nonce — prohlížeč její skripty zablokuje (stránka se zobrazí, jen bez JS). Řešit v S09 (catch-all nebo `not-found` v `/w`). Adminův `@import` Inter z `globals.css` se na `/w` zablokuje (žádaný stav — Dílky mají vlastní písma).
Revize: S04 (rozhodnout landing — dynamický layout = vynucená CSP, nebo statický = Report-Only); S09 (404 pod `/w`).

## 004 — Výjimky z X-Frame-Options a CORP pro vkládané části
Datum: 2026-10-08
Rozhodnutí: `X-Frame-Options: DENY` a `Cross-Origin-Resource-Policy: same-origin` platí všude kromě `/r/*` (rámování řídí `frame-ancestors` z povolených domén klienta), `/embed/*` a `/api/public/v1/*` (CORP `cross-origin`). `/api/invoices/:id/pdf` má `X-Frame-Options: SAMEORIGIN` kvůli náhledu PDF v `<object>` na detailu faktury.
Důvod: objednávací stránka a widget se vkládají na weby klientů (R-016, R-024); `X-Frame-Options` neumí seznam domén a CORP `same-origin` by zablokoval `<script src>` z cizí domény. Náhled PDF: Chrome posuzuje `<object>` s PDF jako rámec.
Zvažované alternativy: povolit rámování `/r` komukoli (clickjacking objednávek); CORS na celé `/api` (zbytečně široké).
Přijaté riziko: `/r/*` lze rámovat z domén na seznamu klienta — klient za ně odpovídá. CORS jen pro přesné originy, bez cookies.
Revize: S11 (napojení na `web_integrations.allowed_origins`).

## 005 — HSTS `preload` zděděný
Datum: 2026-10-08
Rozhodnutí: hodnota `max-age=63072000; includeSubDomains; preload` ponechána beze změny.
Důvod: převzato z dřívější konfigurace (commit f0e47be, 2026-06-16), důvod nezapsán. Samotný token `preload` nic nezapíše — rozhoduje odeslání domény na hstspreload.org, a to není známé. Skill doporučuje `preload` až po měsíci čistého provozu; tady už HTTPS běží měsíce.
Zvažované alternativy: token odebrat — nic by nezměnil, pokud doména na seznamu je, a mátl by.
Přijaté riziko: pokud je doména adminu na preload seznamu, všechny subdomény musí mít HTTPS natrvalo.
Revize: S19 — ověřit na hstspreload.org pro produkční doménu adminu i `zakaziq.cz`.

## 006 — CI audit závislostí dočasně jen jako upozornění
Datum: 2026-10-08
Rozhodnutí: job `dependencies` v `.github/workflows/security.yml` má `continue-on-error: true`.
Důvod: `npm audit --omit=dev --audit-level=high` dnes padá na `next` 14 (critical, oprava až v Next 15.5.24+), `nodemailer` 7, `next-auth`, `postcss`. Oprava = upgrade Next 15, který AGENTS.md B2 dává až po spuštění. Trvale červené CI učí CI ignorovat.
Zvažované alternativy: `--audit-level=critical` (stejně padá na `next`); vypnout job (ztratíme přehled).
Přijaté riziko: nová high/critical zranitelnost neshodí build, jen se objeví v logu jobu.
Revize: S19 — po upgradu Next 15 a nodemailer 10 vrátit `continue-on-error: false`.

## 007 — Landing page dynamická s vynucenou CSP
Datum: 2026-10-08
Rozhodnutí: `app/(marketing)/layout.tsx` bude `force-dynamic` a `/`, `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva` dostanou vynucenou CSP (profil `workspace`). V `lib/security/csp.ts` jako přesné cesty, ne prefix `/` (ten by chytil celý web včetně adminu). Rozhodl Kryštof v S03 (R-033), provede S04. Uzavírá revizi „S04“ u #003.
Důvod: nonce dostanou jen dynamické stránky; Report-Only nic nechrání a landing je veřejná vstupní stránka produktu.
Zvažované alternativy: statické generování + Report-Only (rychlejší z CDN, ale bez ochrany); hashe místo nonce (Next 14 je pro App Router neumí).
Přijaté riziko: o něco horší TTFB, HTML se necachuje na CDN. Landing nemá veřejný vstup (R-032), takže útočná plocha je malá.
Revize: S05 (změřit LCP/TTFB na produkčním buildu); při upgradu na Next 15 (podpora statické stránky s CSP).

## 008 — Oddělení účtů v DB: role ws_app, RLS, výjimky
Datum: 2026-10-08
Rozhodnutí: Workspace se k Neonu připojuje jen rolí `ws_app` (`DATABASE_URL_WS`), založenou přes SQL (`scripts/ws-create-role.js`), bez `BYPASSRLS` a bez práv v `public`. Každá tabulka `ws` s daty účtu má RLS `account_id = ws.current_account()`, vazby jsou složené cizí klíče `(account_id, x_id)`. Výjimky: (a) `SECURITY DEFINER` funkce `ws.account_by_clerk_org` (s `search_path = pg_catalog, pg_temp`, `EXECUTE` jen `ws_app`), protože `requireWorkspace()` hledá účet dřív, než ho zná; (b) systémové tabulky `stripe_events`, `webhook_events`, `rate_limits` bez RLS — webhook zná účet až po zpracování, neukládá se payload ani jiné osobní údaje; (c) vlastník tabulek (`neondb_owner`, admin konzole) RLS nepodléhá. `ws_app` nemá `UPDATE`/`DELETE` na `audit_log`. R-035.
Důvod: aplikační filtr `account_id` je první pojistka, RLS druhá — jedna chyba v dotazu nesmí ukázat data cizí firmy. Role z Neon konzole dostávají `neon_superuser` s `BYPASSRLS` (ověřeno), RLS by pro ně neplatila. Kontrola cizích klíčů RLS obchází, proto `account_id` v každém klíči.
Zvažované alternativy: role z Neon konzole (BYPASSRLS); `FORCE ROW LEVEL SECURITY` i pro vlastníka (admin by potřeboval vlastní roli a migrace by se komplikovaly); zvláštní role `ws_system` s BYPASSRLS pro webhooky a crony (další secret v env, širší než pár úzkých funkcí); jednoduché cizí klíče (cizí řádek připojitelný přes UUID).
Přijaté riziko: `ws_app` si `app.account_id` nastavuje sama — při SQL injection v kódu Workspace by RLS útočníka nezastavila (proto jen parametrizované dotazy přes `q`/`wsDb`, nikdy skládaný SQL). `wsSystem` jde zneužít k dotazu bez účtu, na tabulky s RLS ale nevidí nic. Heslo role jde při založení do DB jako SQL literál (Neon ho neloguje ve výchozím nastavení). `ws_app` vidí v katalogu názvy tabulek `public` (jen metadata, žádná data). Unikátní slug byznysu prozradí, že slug existuje (slugy jsou veřejné v `/r/`).
Revize: S11 a S16 (každá nová `SECURITY DEFINER` funkce sem dopsat) · S19 (audit před spuštěním).

## 009 — Clerk jen pod /w, session cookie čitelná z JavaScriptu
Datum: 2026-10-09
Rozhodnutí: přihlášení Workspace přes Clerk (`@clerk/nextjs` 6.39.7). `clerkMiddleware` běží jen pro `/w` a `/api/ws`, `ClerkProvider` jen v `app/w/layout.tsx`. Session Clerku je krátký JWT v cookie `__session` (platnost ~60 s, obnovuje ji clerk-js), která podle návrhu Clerku **není HttpOnly** — clerk-js ji čte a obnovuje. Dlouhodobá cookie `__client` je na doméně Frontend API Clerku a HttpOnly je.
Důvod: Clerk je dané rozhodnutí (R-014, AGENTS.md B4). HttpOnly na `__session` Clerk nepodporuje. Krátká platnost omezuje, co s ukradeným tokenem jde udělat.
Zvažované alternativy: vlastní přihlášení (hesla, ověřování e-mailů a Google OAuth bychom psali sami — větší riziko než tahle výjimka); Clerk i pro admin (mimo rozsah, otevřená otázka v `memory/memory.md`).
Přijaté riziko: XSS na `/w` by mohla číst session token a jednat jménem uživatele, dokud token platí. Hlavní obrana zůstává vynucená CSP s nonce na `/w` a zákaz vykreslování nedůvěryhodného HTML (B13).
Revize: S19 (audit před spuštěním) · při upgradu Clerku na verzi s jinou správou session.

## 010 — Veřejný příjem poptávek: klíče, funkce bez účtu, bez captchy
Datum: 2026-10-10
Rozhodnutí: (1) Tři nové `SECURITY DEFINER` funkce pro požadavky, které účet ještě neznají: `ws.integration_by_public_key`, `ws.integration_by_secret_prefix` (vrací hash k porovnání v aplikaci), `ws.business_by_public_slug` (veřejný klíč a povolené domény). Jen `EXECUTE` pro `ws_app`, nic o zákaznících. (2) Tajný klíč = prefix + HMAC-SHA256 s pepřem `WS_KEY_PEPPER` (env, ne DB). (3) Veřejný klíč widgetu sám nic nedovolí, platí jen s `Origin` ze seznamu. (4) Objednávací stránka a widget bez captchy: honeypot + rate limit (20/min IP, 300/h byznys, stránka 8/10 min).
Důvod: pod RLS by veřejný požadavek bez účtu neviděl nic (R-035); pepř mimo DB znamená, že únik DB sám nestačí k útoku hrubou silou na klíče. Captcha (Turnstile) = skript třetí strany na stránce, kde zákazník píše osobní údaje, a další host v CSP; pro start stačí honeypot a limity.
Zvažované alternativy: role s BYPASSRLS pro veřejné API (široké); bcrypt/argon2 na tajný klíč (klíč má 190 bitů náhody, pomalý hash nic nepřidá a zdrží každý požadavek); Turnstile hned (viz výše).
Přijaté riziko: kdo zná slug, zjistí, že byznys existuje a jeho veřejný klíč (je i v kódu widgetu). Robot obcházející honeypot může v rámci limitů poslat spam poptávky (zákazníka založí) — vidět v záznamu Napojený web. Origin jde mimo prohlížeč podvrhnout: veřejný klíč tak umožní poslat poptávku i z curl, stejně jako vyplnit formulář — proto limity.
Revize: S19 (audit před spuštěním) · při prvním spamu zapnout Turnstile na `/r` a ve widgetu.

