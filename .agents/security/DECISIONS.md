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
Důvod: `npm audit --omit=dev --audit-level=high` padal na `next` 14 (critical), `nodemailer` 7, `next-auth`, `postcss`. Next je od 2026-10-17 na 16.4.2 (R-053), zbývá `nodemailer` 7 (oprava v 10), `next-auth` 4 a řetězec `tailwindcss` 3. Trvale červené CI učí CI ignorovat.
Zvažované alternativy: `--audit-level=critical` (stejně padá na `next`); vypnout job (ztratíme přehled).
Přijaté riziko: nová high/critical zranitelnost neshodí build, jen se objeví v logu jobu.
Revize: S19 — po upgradu nodemailer 10 (a rozhodnutí o next-auth 4 / tailwindcss 4) vrátit `continue-on-error: false`. Next 16.2.12 audit neprošel (opravy od 16.3.8), proto cíl 16.4.2.
Revize S19 (2026-10-17): Nodemailer je 10.1.2 a odstranil vlastní high nález. Peer rozsah `next-auth@4` stále uvádí nepovinný Nodemailer 7; projekt používá pouze CredentialsProvider, proto instalace používá `.npmrc` `legacy-peer-deps=true` (R-056). Audit stále hlásí 5 high + 2 moderate v Tailwind 3 řetězci; `npm audit fix` vyžaduje Tailwind 4 major. CI zůstává neblokující do migračního rozhodnutí a opravy nálezů.
Revize S19 (2026-10-17): Nodemailer je 10.1.2 a odstranil vlastní high nález. Peer rozsah `next-auth@4` stále uvádí volitelný Nodemailer 7; projekt používá pouze CredentialsProvider, proto instalace používá `.npmrc` `legacy-peer-deps=true` (R-056). Audit stále hlásí 5 high + 2 moderate v Tailwind 3 řetězci; `npm audit fix` vyžaduje Tailwind 4 major. CI zůstává non-blocking do migračního rozhodnutí a opravy nálezů.
Revize (2026-10-31): `npm audit fix` bez `--force` aktualizoval zranitelné závislosti v rámci existujících rozsahů verzí. `npm audit` i `npm audit --omit=dev --audit-level=high` hlásí 0 zranitelností. Podle původní podmínky je `continue-on-error` odstraněno; job závislostí nyní blokuje CI při high/critical nálezu.

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

## 011 — Odkazy z e-mailů bez přihlášení, odesílání bez častého cronu
Datum: 2026-10-10
Rozhodnutí: (1) Odkazy v e-mailech (Potvrdit / Jiný čas pro majitele, odhlášení zákazníka a novinek, termín do kalendáře) nesou ID účtu a záznamu podepsané HMAC-SHA256 klíčem odvozeným z `WS_KEY_PEPPER` (vlastní účel podpisu, žádná nová env). Účet z ověřeného odkazu smí nastavit kontext RLS, stejně jako klíč webu. (2) Akce majitele jsou jednorázové a s platností 72 h: řádek `ws.action_tokens`, použití atomicky `UPDATE … WHERE used_at IS NULL AND expires_at > now()`; po potvrzení se zneplatní i odkazy ostatních vlastníků k téže poptávce, při selhání (obsazený čas) se odkaz vrátí. (3) Otevření stránky (GET) nic nemění — e-mailové programy a antiviry odkazy načítají předem; mění až tlačítko (server action) nebo POST odhlášení jedním klikem (RFC 8058). (4) Stránky s odkazem mají `Referrer-Policy: no-referrer`. (5) Webhook Resendu ověřuje podpis Svix ručně (HMAC, tolerance 5 min, tělo max. 64 kB), účet a zprávu bere z tagů, které jsme e-mailu dali při odeslání. (6) Náhled e-mailu v Nastavení je `iframe sandbox=""` se `srcdoc` — bez skriptů a s neprůhledným originem; CSP se neměnila (srcdoc pod `frame-src 'none'` funguje, ověřeno v Chrome).
Důvod: tlačítka z e-mailu bez přihlášení chce plán (majitel v autě); jednorázový řádek v DB umí „po použití neplatný“, čistě podepsaný odkaz ne. Odvozený klíč = jedno tajemství méně k nastavení ve Vercelu. Svix knihovna by byla další závislost kvůli 20 řádkům.
Zvažované alternativy: JWT s expirací bez DB (nejde zneplatnit po použití); samostatné `WS_LINK_SECRET` (další env, stejná bezpečnost); potvrzení přímo GETem (prefetch by poptávku potvrdil sám).
Přijaté riziko: odkaz je v URL, takže skončí v historii prohlížeče a v logu požadavků Vercelu — akční odkaz je jednorázový a do 72 h, odhlášení a .ics prozradí jen málo (název firmy, čas termínu). Přeposlaný e-mail majitele umožní příjemci jednou potvrdit poptávku. Změna `WS_KEY_PEPPER` zneplatní i všechny odeslané odkazy.
Revize: S19 (audit před spuštěním).

## 012 — Klientský portál přes trvalé náhodné UUID
Datum: 2026-10-10
Rozhodnutí: `/z/[token]` používá náhodné UUID generované DB pro termín nebo zakázku. Jediná funkce bez známého účtu, `ws.portal_lookup`, vrací jen `account_id`, `business_id`, druh a ID záznamu; vše ostatní běží pod RLS. Odkaz nemá vlastní expiraci, zneplatní ho smazání záznamu, archivace byznysu nebo vypnutí portálu.
Důvod: Zákazník se nemá registrovat a stejný odkaz má zůstat použitelný z e-mailu i telefonu. UUID má dostatek náhody a neobsahuje osobní údaje.
Zvažované alternativy: krátký podepsaný odkaz s expirací (zákazník by po čase ztratil přehled); veřejná role s BYPASSRLS (příliš široká); účet v URL (prozrazuje strukturu a svádí k důvěře klientskému vstupu).
Přijaté riziko: kdo odkaz získá přeposláním nebo z historie prohlížeče, vidí omezený obsah a do termínu pravidel může termín přesunout nebo zrušit. Jednotlivý token zatím nemá tlačítko pro rotaci; akce jsou omezené podle IP i záznamu a všechny odkazy byznysu lze vypnout funkcí Klientský portál.
Revize: S19 (audit před spuštěním; zvážit rotaci jednotlivého odkazu).

## 013 — Admin konzole čte schéma ws vlastníkem tabulek
Datum: 2026-10-10
Rozhodnutí: `/dashboard/klienti` a `/dashboard/novinky` (S17) čtou `ws` přes `DATABASE_URL` (vlastník tabulek, RLS nepodléhá) v `lib/ws/admin/db.ts` se `server-only`. Přístup hlídá NextAuth: middleware a layout `/dashboard`, každá server action znovu `getAdmin()`. Admin zapisuje jen do `ws.product_news`, `ws.account_admin_notes` a `ws.audit_log`; data klienta (založení účtu, klíče webu) mění přes `lib/ws` rolí `ws_app` pod RLS účtu, který admin ověřil podle ID z URL. Poznámky admina jsou v `ws.account_admin_notes` s RLS a bez jakýchkoli práv pro `ws_app`. Audit zapisuje `actor = 'admin'` bez e-mailu (audit účtu může číst i klient). Obrázky novinek jsou v DB (`bytea`, max. 600 kB, typ ověřený podle prvních bajtů — PNG, JPEG, WebP, nikdy SVG) a servíruje je veřejná `/z/novinky/[id]/obrazek` jen u zveřejněné novinky, s `Cross-Origin-Resource-Policy: cross-origin` (webmail načítá obrázek z cizí domény).
Důvod: admin je jeden (R-001) a potřebuje přehled přes všechny účty; samostatná role pro admina by znamenala další connection string a správu práv bez přínosu. Obrázek z cizí domény by zablokovala CSP aplikace (`img-src 'self'`), úložiště souborů v projektu není.
Zvažované alternativy: role `ws_admin` jen pro čtení (zápisy novinek a poznámek by stejně potřebovaly vlastníka nebo granty navíc); obrázek jako odkaz https (rozšíření `img-src` o libovolnou doménu); Vercel Blob (nová závislost a služba).
Přijaté riziko: chyba v kódu adminu by mohla číst cizí účty bez pojistky RLS — omezeno tím, že admin vidí všechno záměrně, kód je jen v `lib/ws/admin/` a testy ověřují, že bez session akce nic neudělají. Zveřejněný obrázek může zůstat v cache až 1 h po skrytí novinky.
Revize: S19 (audit před spuštěním).

## 014 — GDPR: výmaz, export, zrušení účtu a service worker
Datum: 2026-10-17
Rozhodnutí: (1) Výmaz zákazníka (`ws.erase_customer`) a zrušení/obnovení účtu (`ws.close_account`, `ws.reopen_account`) běží jako volající (`ws_app` pod RLS) a jen pro majitele (`hasRole owner`); výmaz funguje i bez předplatného. (2) Denní úklid volá dvě `SECURITY DEFINER` funkce bez parametrů s pevným `search_path` (`ws.anonymize_expired_invoices`, `ws.purge_closed_accounts`), `EXECUTE` má `ws_app`. Mažou jen řádky po lhůtě (`anonymize_after <= dnes`, `delete_after <= now()`). (3) Export `/w/ucet/export` jen pro majitele, limit 5 za hodinu na účet, zápis do auditu; názvy souborů v ZIPu očištěné (bez `/` a `..`), buňky CSV začínající `= + - @` dostanou apostrof. (4) Inline skript „Podle systému“ ve `WsRoot` je konstantní řetězec s nonce z `proxy.ts` (CSP beze změny). (5) Service worker `public/sw.js` se scope `/w` zachytává jen navigace a při chybě sítě vrátí `public/offline.html`; nic dalšího neukládá. `worker-src 'self'` a `manifest-src 'self'` už CSP měla.
Důvod: GDPR čl. 17 a 20 (výmaz a přenositelnost) a čl. 28 (zpracovatel). Cron nemá kontext účtu, proto funkce bez parametrů místo obcházení RLS v aplikaci. Cache dat v telefonu by po ztrátě telefonu prozradila zákazníky.
Zvažované alternativy: mazání účtů admin rolí z cronu (další connection string v cronu); offline režim s uloženými daty (riziko pro osobní údaje); ZIP knihovna (nová závislost).
Přijaté riziko: kdokoli s rolí `ws_app` může úklid spustit dřív než cron — smaže ale jen to, co je po lhůtě. Smazáním účtu zmizí i jeho audit (kaskáda). Vystavené faktury vymazaného zákazníka zůstávají s jménem a adresou 10 let (zákonná povinnost, R-054).
Revize: S19 (audit před spuštěním).

## 015 — Vynucená CSP pro všechny cesty
Datum: 2026-10-17
Rozhodnutí: V S19 přepnout CSP admin profilu i všech ostatních cest z Report-Only do vynuceného režimu. `/login` je dynamický (`app/(auth)/login/layout.tsx`), aby Next.js přidal nonce. Prázdná výchozí 404 zůstává statická; CSP může zablokovat její hydrataci, ale neobsahuje citlivé ani uživatelské údaje.
Důvod: před veřejným spuštěním má CSP vynucovat pravidla napříč aplikací; dřívější blokace na statickém `/login` je odstraněna dynamickým layoutem. Zásah do adminu je výslovnou součástí S19.
Zvažované alternativy: ponechat admin v Report-Only (nechrání před skripty) nebo uvolnit `script-src` (nepřijatelné oslabení CSP).
Přijaté riziko: statická 404 může být zobrazena bez klientské hydratace. Při přidání vlastní chybové stránky ověřit nonce a vynucenou CSP.
Revize: po ručním průchodu adminu a Workspace v Chrome i Safari na Vercel Preview.

## 016 — Kontext obrazovky jednou SECURITY DEFINER funkcí
Datum: 2026-10-18
Rozhodnutí: Migrace 085 přidává `ws.business_scope(org_id text, business_slug text)` (SQL, `STABLE SECURITY DEFINER`, `search_path = pg_catalog, pg_temp`, `REVOKE` od `PUBLIC`, `EXECUTE` jen `ws_app`). Pro Clerk organizaci z přihlášení vrátí jednorázově účet, byznys podle slugu (jen nearchivovaný), byznysy účtu pro přepínač, zapnuté funkce a řádky předplatného. Neznámá organizace → žádný řádek, cizí slug → `business` je null (aplikace dá 404). Výsledek `lib/ws/scope.ts` uloží do paměti jednoho požadavku (`React.cache`), takže layout i stránka na další dotazy kvůli účtu a byznysu nesahají. Chybí-li funkce v DB (kód `42883`), vrací se starý postup po částech.
Důvod: navigace dělala za sebou tři dotazy do Neonu ještě před daty stránky (R-058, RD02). Stejný vzor jako `ws.account_by_clerk_org` (#008), jen vrací víc polí téhož účtu.
Zvažované alternativy: víc oddělených `SECURITY DEFINER` funkcí (víc kol), cache dat účtu napříč požadavky (riziko úniku mezi účty, odmítnuto), vypnutí RLS pro čtení (nepřijatelné).
Přijaté riziko: funkce vrací víc než jen `id` (název, barvu, nastavení byznysu a stav předplatného) komukoli, kdo zná Clerk ID organizace a smí volat jako `ws_app`. Clerk ID organizace přichází jen z ověřeného přihlášení, `ws_app` jiný vstup než aplikace nemá; bezpečnostní hranice se tím nemění. Sloupce jsou vyjmenované (žádné `SELECT *`), takže přidaný sloupec v `businesses` se sám neprozradí.
Revize: S19 (audit před spuštěním).

## 017 — Minimalizace údajů v administraci Workspace
Datum: 2026-10-19
Rozhodnutí: Admin přehled účtů může používat jen souhrnné počty/stavy, údaje účtu, byznysů a týmu. Nečte osobní ani finanční obsah zákazníků, poptávek, termínů a faktur, interní poznámky ani volná pole auditu. Účelová práce s účtem (pozvánka, nastavení integrace a audit akce) zůstává za `requireAdmin()`.
Důvod: Kryštof schválil v RD11 omezení osobních údajů; soukromí klientů nemá záviset pouze na tom, kdo smí otevřít admin konzoli.
Zvažované alternativy: odebrat admin databázové připojení úplně (zrušilo by existující operace nad účty); vytvořit oddělenou read-only roli (vyžaduje samostatnou změnu databázových oprávnění a nasazení).
Přijaté riziko: databázové připojení administrace stále používá vlastníka tabulek a technicky může číst všechny řádky. Omezení je v kódu a testech, ne v DB-grantu; revize při S19, před veřejným spuštěním.
Revize: S19 nebo dříve při změně admin dotazů či databázové role.
