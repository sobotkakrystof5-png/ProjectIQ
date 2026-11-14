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

## 018 — Požadavky klientů z portálu: mikrofon na /p, přepis přes OpenAI, text jako nedůvěryhodný vstup
Datum: 2026-11-01
Rozhodnutí: (1) `Permissions-Policy` povoluje `microphone=(self)` jen na `/p/*` (klientský portál), jinde zůstává `microphone=()`; kamera a ostatní zůstávají zakázané. (2) Nahrávka jde přes `POST /api/public/portal/[token]/transcribe` na OpenAI k přepisu a neukládá se nikam, vrací se jen text, který klient před odesláním zkontroluje. Typ a velikost (4 MB) se ověřují na serveru; limit 6 nahrávek/10 min na IP a 15/den na projekt, protože každé volání stojí peníze. (3) Text od klienta je nedůvěryhodný vstup: AI ho jen shrnuje (v citaci, s odstraněním značek, kterými by se dala zavřít), výsledek nic nespouští a zadání pro Claude Code vkládá člověk ručně po přečtení. Žádné automatické spuštění agenta.
Důvod: Kryštof chce, aby klient mohl požadavek nadiktovat; veřejný odkaz s tokenem je jediná ochrana, takže nesmí jít zneužít k nákladům ani k vložení instrukcí agentovi s přístupem k počítači.
Zvažované alternativy: trvalé ukládání audia (osobní údaje, retence navíc); automatické spuštění Claude Code (Routines/Channels, riziko injekce z cizího textu); mikrofon povolit globálně (zbytečně široké).
Přijaté riziko: audio opouští EU infrastrukturu aplikace a zpracovává ho OpenAI; potvrzení evropské rezidence pro přepis řeči nemáme. Token v odkazu `/p/[token]` zůstává jedinou autentizací (viz #012 pro Workspace).
Revize: před spuštěním klientského prostoru s přihlášením nebo při změně poskytovatele přepisu; ověřit smlouvu o zpracování (DPA) a evropskou rezidenci OpenAI.

## 019 — Klíč projektu pro hlášení z Claude Code (jen zápis konceptu)
Datum: 2026-11-01
Rozhodnutí: Každý projekt může mít jeden klíč `zk_agent_<prefix>_<tajemství>` (`project_agent_keys`, migrace 094). V DB je jen prefix a HMAC-SHA256 klíče s pepřem `AGENT_KEY_PEPPER` (samostatný od `WS_KEY_PEPPER`), porovnání v konstantním čase, bez pepře selže zavřeně. Klíč umí jediné: `POST /api/agent/v1/projects/{id}/reports` uloží KONCEPT (`status = 'draft'`, `source = 'claude_code'`) do téhož projektu. Nic nečte, nic nepublikuje. Server zakryje podezřelé řetězce (klíče, Bearer, JWT, connection stringy, řádky z `.env`, cesty v domovské složce), nastaví `contains_sensitive` a takový koncept nejde schválit, dokud se text neupraví (CHECK v DB navíc zakazuje zveřejnit citlivou zprávu). Limity: 20 hlášení/hod na klíč, 60 volání/hod na IP (počítá se i neúspěšné), tělo do 32 kB, nadpis 160 a text 4000 znaků. Odpovědi neprozradí, jestli projekt existuje (401 pro špatný klíč, cizí i neexistující projekt). Bez CORS. Vytvoření, otočení a zneplatnění klíče jen z adminu (`requireAuth`), zaznamenává se kdo a kdy (`created_by`, `revoked_by`).
Důvod: Kryštof chce, aby po práci v Claude Code vzniklo hlášení bez psaní (KP04); klíč leží v prostředí projektu klienta a může uniknout, proto musí mít co nejmenší sílu.
Zvažované alternativy: sdílený klíč pro všechny projekty (únik = všechno); klíč s právem číst nebo publikovat (příliš silný); automatické publikování bez schválení (D-K5, jen po důvěře a mimo citlivé řetězce, zatím nezavedeno).
Přijaté riziko: kdo klíč získá, může zaplavit admina koncepty (omezeno limitem) nebo napsat zavádějící koncept, který Kryštof musí schválit. Zakrývání řetězců je heuristika, ne záruka; schvalování člověkem je hlavní pojistka. Text hlášení pochází od agenta, který mohl číst cizí data, proto se zobrazuje jako text (React escapuje), nikdy jako HTML.
Revize: po prvním skutečném použití a před automatickým publikováním (D-K5).

## 020 — Klientský prostor: schéma `portal`, role bez přístupu do `public`, Clerk pro klienty
Datum: 2026-11-01
Rozhodnutí: Přihlášení klienti (`/klient`, Clerk, bez organizací) čtou a zapisují jen ve schématu `portal` rolí `portal_app` (`DATABASE_URL_PORTAL`, `scripts/portal-create-role.js`). Role nemá žádná práva do `public`. Každá tabulka má `client_id`, RLS podle `app.client_id` nastaveného v transakci a složené cizí klíče. Do `portal` se z adminu dostává jen schválené triggery: vybrané sloupce zakázky (bez ceny, poznámek, e-mailu klienta a tokenu `/p`) a aktivita se stavem `published`. Zápisy klienta (požadavek, zpráva, hodnocení) jen funkcemi `portal.submit_*` (SECURITY DEFINER), které ověří členství a zakázku, hlídají limity a zapíšou i do interních tabulek admina. Členství určuje `portal.members` (ne Clerk), pozvánky jsou jednorázové (HMAC hash kódu s `PORTAL_INVITE_PEPPER`, platí 14 dní, volitelně vázané na ověřený e-mail, uplatnění atomicky funkcí `portal.redeem_invite`; role `portal_app` pozvánky nevidí). Odkaz s kódem uplatní až tlačítko po přihlášení, ne samotné otevření. Test oddělení klientů proti PGlite je `lib/__tests__/portal-isolation.test.ts`.
Důvod: jedna chyba ve filtru nesmí ukázat cizí zakázku, interní poznámky ani ceny (admin spojení je vlastník tabulek bez RLS). Stejný model jako Workspace (#008).
Zvažované alternativy: izolace jen v kódu (`requireClient()` + filtr, o týden rychlejší, nechrání před zapomenutou podmínkou); trvalý sdílený klíč místo pozvánky (nejde odvolat po lidech).
Přijaté riziko: kdo má platnou pozvánku a ovládá přihlášení v Clerku, vstoupí; vázání na e-mail je volitelné. Admin spojení (vlastník) technicky čte i `portal`. Clerk je zatím jen dev instance (viz STATE). Pozvánku v adrese může zachytit historie prohlížeče nebo proxy; kód je jednorázový a krátkodobý, stránka posílá `referrer: no-referrer`.
Revize: před spuštěním s prvním klientem (KP10) a při zavedení produkční instance Clerku.

## 021 — Clerk `authorizedParties` jen v produkci, kratší session adminu
Datum: 2026-11-03
Rozhodnutí: Oba Clerk middlewary v `proxy.ts` (Workspace a klientský prostor) dostávají `authorizedParties` z `lib/security/clerk.ts`: na Vercelu Production jen origin `NEXT_PUBLIC_APP_URL` (https), jinde nic. NextAuth session adminu platí 12 h místo výchozích 30 dní (`lib/auth.ts`). Předání zadání do Claude Code (KP09) spouští `claude --permission-mode plan`.
Důvod: review před spuštěním 2026-11-03 (AUDIT-LOG). Clerk `authorizedParties` doporučuje pro produkci: session token vydaný pro jinou (sub)doménu proxy odmítne. Admin čte data všech klientů, ukradená session nemá platit měsíc. Text zadání pochází od klienta a může obsahovat pokyny pro agenta.
Zvažované alternativy: `authorizedParties` všude včetně Preview (Preview adresy se mění podle větve, přihlášení by padalo); celkový limit chybných přihlášení adminu napříč IP (útočník by jím mohl admina trvale zamknout, bcrypt a zámek na IP stačí, skutečná pojistka je dvoufázové ověření).
Přijaté riziko: Preview a dev kontrolu `azp` nemají. Špatná `NEXT_PUBLIC_APP_URL` v Production rozbije přihlášení přes Clerk, neplatná nebo http adresa kontrolu vypne (fail-open kvůli dostupnosti). Admin zůstává bez dvoufázového ověření (STATE → Otevřené položky). Režim plánu brání změnám a spouštění příkazů, ale čtecí nástroje (soubory, podle nastavení i web) zůstávají; pokyn vložený do zadání by se mohl pokusit obsah repa někam vynést. Hlavní pojistkou zůstává, že zadání před spuštěním přečte člověk.
Revize: nejpozději 2026-12-31, dřív při zavedení dvoufázového ověření adminu nebo změně hlavního hostu.

## 022 — PDF faktury smí ležet v cache prohlížeče (ETag místo `no-store`)
Datum: 2026-11-12
Rozhodnutí: `/api/invoices/:id/pdf` posílá `ETag` z `md5(pdf_data)` a `Cache-Control: private, max-age=0, must-revalidate` místo dřívějšího `private, no-store`. Při shodě `If-None-Match` vrací 304 a bajty z databáze vůbec nečte (dva dotazy: nejdřív md5 + název, obsah až když je potřeba). `private` zůstává, takže dokument nikdy neuloží sdílená cache ani CDN; `max-age=0, must-revalidate` znamená, že se při každém otevření ověří ETag, takže přepsané PDF se nemůže ukázat staré. Přihlášení (`getServerSession`) zůstává jedinou ochranou a kontroluje se před prvním dotazem. `X-Frame-Options: SAMEORIGIN` na téhle cestě se nemění (#004, STATE → Neměnit bez zeptání).
Důvod: AD08 (rychlost). Odkaz na PDF je v detailu zakázky i v evidenci faktur a otevírá se opakovaně; dokument může mít megabajty a `no-store` ho nutil stáhnout celý při každém kliknutí. Ten přenos jde přes serverless funkci, takže se platí dvakrát — z databáze a ke klientovi.
Zvažované alternativy: `no-store` zachovat a jen zúžit dotazy (nic neušetří, přenos je ta drahá část); `max-age` v řádu minut (přepsané PDF by se krátce ukazovalo staré); skutečné streamování `bytea` (Neon HTTP driver vrací celou odpověď jedním JSONem, stream by potřeboval Pool přes WebSocket — samostatné rozhodnutí).
Přijaté riziko: faktura s údaji klienta (jméno, adresa, IČO, DIČ) se smí uložit do cache prohlížeče na disk, takže zůstane na počítači i po odhlášení, dokud ji někdo nevymaže. Platí to pro počítač admina, který ta PDF stejně běžně ukládá a posílá e-mailem; `private` drží dokument mimo sdílené cache a proxy. ETag je md5 obsahu — prozradí jen tomu, kdo už je přihlášený, že se dokument nezměnil.
Revize: při zavedení klientského přístupu k fakturám (kde by cache ležela na cizím zařízení) nebo při přechodu na streamování přes Pool.

## 023 — ARES jako jediná nová vnější závislost adminu (fakturace)
Datum: 2026-11-12
Rozhodnutí: `lib/ares.ts` volá **ze serveru** `GET https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}` a bere z odpovědi jen tři údaje (jméno, adresa sídla, DIČ). Pravidla: IČO se nejdřív ověří kontrolní číslicí (mod 11), takže překlep do sítě vůbec neodejde; `redirect: 'error'`; timeout 3 s (`AbortSignal.timeout`); odpověď projde Zodem s délkovými stropy a bere se z ní jen whitelist polí; výsledek se drží v paměti procesu 24 h (nedostupnost se nepamatuje); hodnota se nikdy nevykresluje jako HTML, jen se předvyplní do pole formuláře; **selhání nikdy neblokuje vystavení faktury**. Volá to jedině server action `lookupCompany` pod `requireAuth()`. Požadavek nenese žádný identifikátor uživatele ani vlastní User-Agent. CSP se **nemění** — prohlížeč na ares.gov.cz nesahá.
Důvod: AD12 (R-086). Bez toho se IČO, jméno a adresa odběratele opisují ručně do každé faktury. Endpoint ověřen živým požadavkem 2026-11-12 (HTTP 200, `application/json`, veřejná data obchodního rejstříku), ne odhadnut.
Zvažované alternativy: volat ARES z prohlížeče (vyžadovalo by rozšíření `connect-src` v CSP a posílalo požadavky z klientské sítě — zamítnuto); ukládat odpovědi do databáze (další firemní údaje v cizí tabulce bez užitku, paměť procesu stačí); nedělat nic a opisovat ručně (zůstává jako záloha při výpadku).
Přijaté riziko: ARES se dozví, na která IČO se admin ptá (jsou to odběratelé faktur). Odpověď je cizí vstup — proto Zod, stropy délek a žádné HTML. Výpadek rejstříku znamená ruční vyplnění, ne chybu. Paměťová cache může do 24 h vrátit jméno, které se v rejstříku mezitím změnilo.
Revize: nejpozději 2026-12-31, dřív při přechodu na jiný rejstřík nebo kdyby se odpověď ARES začala ukládat do databáze.

## 024 — Vystavená faktura je neměnná v databázi, ne v UI
Datum: 2026-11-12
Rozhodnutí: migrace 107 přidává trigger `admin_invoice_locked`: u řádku s číslem z vlastní řady (`number_seq IS NOT NULL`) odmítne změnu čísla, částky, DPH, měny, dat, položek, dodavatele i odběratele a nedovolí vzít zpět storno. Měnit jde dál jen to, co se o faktuře dozvídáme po vystavení — zaplacení, storno, poznámka, odeslání, vazba na zakázku a na transakci v ledgeru. Číslo přiděluje funkce `admin_invoice_issue` pod zámkem jediného řádku `admin_settings`, částku i DPH si databáze **počítá z položek sama** a proti poslané hodnotě je porovná. Obě funkce jsou `SECURITY INVOKER` s připnutým `search_path` a `REVOKE ALL ... FROM PUBLIC`. Archivu cizích PDF (`number_seq IS NULL`) se trigger netýká vůbec.
Důvod: AD12. Vystavenou fakturu dnes přepíše cokoli — formulář archivu i AI přepis z PDF. Doklad, který už odešel klientovi, se ale opravuje stornem a novou fakturou, ne editací. Kontrola v aplikaci nestačí: repo samo dokládá proč (migrace 046 přidala UNIQUE právě proto, že kontrola v kódu byla TOCTOU).
Zvažované alternativy: hlídat neměnnost jen v server action (neplatí pro ruční `UPDATE` v konzoli ani pro budoucí cestu, která na to zapomene); verzovat doklady a psát nové verze (složitější, a zákon stejně chce storno + nový doklad).
Přijaté riziko: admin se připojuje rolí vlastníka tabulek, takže si trigger může kdykoli vypnout (`ALTER TABLE ... DISABLE TRIGGER`) — proti omylu to chrání, proti záměrnému zásahu ne. Oprava chyby stojí storno a novou fakturu, čísla v řadě tím vznikají „prázdná" (to je ale správně, číslo se nerecykluje).
Revize: při zavedení samostatné role pro běh adminu bez DDL (otevřený problém v paměti) nebo při změně pravidel fakturace.

## 025 — AI asistent navrhuje, nekoná: prompt ze serveru a whitelist executorů
Datum: 2026-11-13
Rozhodnutí: `app/api/ai-assistant/route.ts` přestává přijímat `systemPrompt` a `messages` z prohlížeče. Tělo jde přes Zod (`mode` z výčtu `CONSULT_MODES`, `text` do 2000 znaků, `contextRef` jako `{kind, id:uuid}`, nejvýš 20 předchozích replik jen s rolemi `user`/`assistant` a textovým obsahem); systémový prompt skládá server (`lib/ai/prompts.ts`) a data projektu načítá server (`lib/ai/context.ts`). Kontext **nikdy** nečte `pdf_data`, přihlašovací tabulky, `project_agent_keys`, env ani schéma `ws`, je zarámovaný `<kontext>` a prošlý `redactSensitive()`. Navíc rate limit (12/min na jeden klíč `admin`, R-001), strop `max_tokens`, `runtime='nodejs'`, `maxDuration=60` a model z `lib/ai/models.ts` (haiku místo opusu). Věta → návrh jede **strukturovaným výstupem se Zodem, ne nástroji**: model vrací typovaný návrh a nic neprovádí. Návrh se ukládá do `ai_suggestions` (migrace 110); při potvrzení posílá prohlížeč **jen `id`** (ověřené jako UUID), server si řádek načte, znovu ho prožene `suggestionSchema` a provede ho whitelist executorů v `lib/admin/suggestion-apply.ts`, které volají tytéž server actions jako lidský formulář. Žádná obecná cesta do SQL. Asistent **neodesílá** (zprávu jen složí do `mailto:`/`sms:`/`wa.me` přes `lib/contacts/href.ts`), **nic nemaže**, **nevystavuje faktury ani nezapisuje příjmy** (otevře předvyplněný formulář) a není na žádné veřejné routě. Nevyřízený návrh propadá po 7 dnech (denní cron `send-reminders`), dvojí provedení hlídá `WHERE status = 'pending'` v UPDATE.
Důvod: AD14 (R-084). Dosavadní route byla díra: systémový prompt i celé pole zpráv šly z prohlížeče bez jediné kontroly, jediná ochrana bylo přihlášení a model byl natvrdo opus. Kdo se dostal k přihlášené záložce admina (XSS, cizí skript, otevřený počítač), měl v ruce model na cizí účet — bez limitu délky, počtu zpráv i frekvence. Text od klienta je navíc nedůvěryhodný vstup (R-069): asistent proto nesmí konat, jen navrhovat.
Zvažované alternativy: nechat model konat přes `tools` (vynucené `tool_choice: any|tool` na opus-5-5 a sonnet-5-5 vrací 400, a hlavně nechceme, aby model zapisoval); držet návrh jen ve stavu prohlížeče (pak by se obsah musel při potvrzení poslat zpátky a nešlo by rozeznat návrh od modelu od čehokoli, co kdo pošle do server action); poslat do kontextu celou zakázku včetně příloh (nepotřebné údaje v požadavku k poskytovateli).
Přijaté riziko: **vložená instrukce v kontextu.** Kontext nese i texty psané klientem (poznámky, požadavky z portálu) a ty mohou model navádět — třeba aby navrhl zprávu na cizí adresu. Nemůže tím vzniknout zápis ani odeslání: provedení vyžaduje klik člověka, executor je whitelist a panel proto **vždycky ukazuje, komu zpráva půjde**. Dál: věta odchází k poskytovateli (Anthropic, USA, SCC — viz `docs/klientsky-prostor/PLAN.md` 8.1) spolu s kontextem obrazovky; `ai_suggestions` drží text věty a návrhu trvale (retence zatím žádná) a `input_text` je sice po `redactSensitive()`, ale může nést jméno nebo telefon klienta. Admin běží rolí vlastníka tabulek, takže si řádek návrhu umí přepsat sám — schéma to ale při potvrzení odhalí a akce se neprovede.
Revize: nejpozději 2026-12-31; dřív při AD15 (paměť projektu — tam přibude retence a výmaz, které pokryjí i `ai_suggestions`) nebo kdyby asistent měl dostat právo cokoli odeslat.
Doplněno 2026-11-13 (AD15): retenci `ai_suggestions` doplnila migrace 111 — `public.purge_memory_retention()` maže návrhy starší 90 dnů a volá ji denní cron `client-retention`. Tím je „retence zatím žádná" z přijatého rizika vyřízená; zbytek rizika (věta odchází k poskytovateli, vložená instrukce v kontextu) platí dál a rozšiřuje ho #026.

## 026 — Paměť projektu: dvě vrstvy, co se do ní nepustí a co z ní jde do promptu
Datum: 2026-11-13
Rozhodnutí: paměť adminu má dvě oddělené vrstvy a nemíchají se (R-085). **Fakta** (`lib/admin/memory/facts.ts`) jsou čistě SQL nad historií, nikdy se neukládají jako text a **jen ony plní formuláře** — do předvyplněného pole se tím nemůže dostat věta, kterou napsal model. **Paměť** (`project_memory`, migrace 111) jsou věty; do promptu jdou označené a do formulářů nikdy. Ochrany: každý ukládaný text projde `redactSensitive()` z `lib/project-activity.ts` a text, ve kterém se něco zakrylo (nebo nese `REDACTION_MARK`), se **odmítne uložit celý** — na rozdíl od zprávy o práci, kterou jde ještě ručně opravit, se paměť čte potichu do promptu. Strop 600 znaků, druh z výčtu, `scope` z výčtu, `refId` jako UUID. Zápis dělá jen přihlášený člověk kliknutím (`app/memory-actions.ts`, Zod); druhá cesta je denní cron (`lib/admin/memory/drafts.ts`), ale ten zakládá **výhradně nepotvrzené** návrhy (`confirmed_by IS NULL`), nejvýš pět zakázek za běh, strukturovaným výstupem se Zodem a bez jediného nástroje. Rámce `<kontext>`, `<fakta>`, `<pamet>`, `<veta>` a `<zpravy>` se čistí **z hodnot** (`lib/ai/markers.ts`), ne z hotového textu. Retence: nepotvrzený návrh 90 dnů, potvrzená paměť tři roky od posledního pohybu (R-076), prošlé a osiřelé maže denní cron; smazání zakázky i kontaktu bere paměť s sebou **triggerem** v databázi, protože `ref_id` je polymorfní a FK to neumí. Funkce `public.purge_memory_retention` má `REVOKE ALL ... FROM PUBLIC`.
Důvod: AD15. Bez redakce by do promptu natrvalo spadl klíč vložený omylem do poznámky; bez retence by jméno a telefon klienta ležely v `project_memory` věčně (`purge_client_retention` z migrace 098 o tabulce neví a polymorfní odkaz do ní nedoplní); bez triggeru by paměť přežila smazání člověka, kterého se týká.
Zvažované alternativy: zakrytý text uložit jako u `project_activity` a jen zakázat schválení (paměť se ale používá i nepotvrzená, takže by zakrytý text do promptu stejně šel); cizí klíč s `ON DELETE CASCADE` (nejde, `ref_id` míří podle `scope` do dvou tabulek); úklid jen v akci mazání (cest ke smazání je víc, ruční SQL při žádosti GDPR mezi nimi); nechat fakta i paměť v jedné tabulce (vymyšlené číslo od modelu by se v adminu tvářilo jako historický fakt, B10).
Přijaté riziko: **vložená instrukce se v paměti udrží.** Kontext asistenta nesl text od klienta už od AD14 (#025); nově z něj denní cron může udělat řádek paměti, který se pak přikládá ke každému dotazu na tu zakázku, dokud ho někdo nezahodí. Zmenšují to čtyři věci: text projde redakcí a čištěním značek, řádek je v promptu označený `nepotvrzeno`, propadá po 90 dnech a model pořád nic nekoná — provedení je klik člověka přes whitelist executorů (#025). **Zápis do paměti není omezený rate limitem** (je to jeden admin, R-001). Zprávy o práci odcházejí modelu i v denním cronu, tedy i ve chvíli, kdy se nikdo nedívá — poskytovatel je týž jako u asistenta (Anthropic, USA, SCC). V adminu **není cesta k exportu údajů kontaktu**, takže řádky paměti zatím nejsou v žádném exportu; výmaz pokrytý je.
Revize: nejpozději 2026-12-31; dřív při zavedení výmazu a exportu kontaktu na žádost GDPR (AD16/KP10), nebo kdyby se paměť měla ukazovat klientovi.

## 027 — Předávací dokument: kde přístup je, ne čím se odemyká
Datum: 2026-11-13
Rozhodnutí: předávací dokument „co bylo dodané" (`projects.handover`, migrace 112) nese seznam dodaného, **místa** přístupů a dvě strany údržby. Každý text projde `redactSensitive()` a dokument, ve kterém se cokoli zakrylo, se **neuloží celý** — uživatel dostane českou větu, ať heslo pošle jinudy. Tvar hlídá Zod (`lib/admin/handover-schema.ts`) se stropy délek a počtu řádků, databáze navíc ověřuje, že `handover` je objekt. PDF se vyrábí při otevření, neukládá se, všechny hodnoty jdou do HTML jen escapované a Chromium běží bez JavaScriptu a bez sítě. Routa `/api/projects/[id]/predani` je **POST** s přihlášením a shodným `Origin`, protože vystavení zapisuje `handover_issued_at`; k faktuře se dokument přikládá jen na výslovné zaškrtnutí.
Důvod: AD16. Dokument odchází klientovi e-mailem, takže je to cesta ven z adminu — přesně ta, kudy by utekl klíč nebo connection string napsaný do poznámky. Zápis na GET by navíc šel vyvolat obrázkem na cizí stránce, což AD08 rušila jinde ve Financích.
Zvažované alternativy: text jen zakrýt a uložit (dokument by odešel s dírou po zakrytém úseku a nikdo by si toho nevšiml); přílohu posílat vždy s fakturou (klient by dostal soupis i tam, kde žádné předání není); ukládat hotové PDF do databáze (megabajty za doklad, který se do poslední chvíle dopisuje).
Přijaté riziko: dokument drží údaje klienta (jména, adresy administrací) natrvalo ve sloupci zakázky a **nemá vlastní retenci** — maže se až se zakázkou. Admin běží rolí vlastníka tabulek, takže kontrola nad `handover` je kontrola proti omylu, ne proti záměru. Vyrobení PDF spouští Chromium bez rate limitu (jeden admin, R-001).
Revize: nejpozději 2026-12-31; dřív při zavedení výmazu a exportu údajů kontaktu na žádost GDPR (AD16/KP10).

## 028 — Kontrola DNS v auditním skriptu selhává zavřeně a ptá se apexu
Datum: 2026-11-14
Rozhodnutí: `.claude/security/security-check.sh` rozlišuje tři stavy DNS — záznam je, záznam není, **dotaz se nepovedl**. Nedostupný resolver je `[CHYBA]` (skript vrací 1), ne tiché OK; resolver se dá vybrat přes `AUDIT_RESOLVER`. CAA, DNSSEC, SPF a DMARC se čtou pro **apex** odvozený z hostu (`AUDIT_APEX` ho přebije), ne pro host, na který se audit pustil, a skript vypisuje, na co se ptal.
Důvod: audit 2026-11-14. `dig +short` píše chyby resolveru na stdout, takže původní `[[ -n "$(dig +short CAA …)" ]]` čtelo `;; connection timed out` jako „záznam existuje" — kontrola byla fail-open a při poruše DNS tvrdila OK. Druhá vada: audit se pouští na `www.zakaziq.cz`, což je CNAME na `*.vercel-dns-017.com`; dotaz na CAA alias následuje, takže se jako naše CAA vykazovala Vercelovská, zatímco SPF a DMARC vycházely jako chybějící, protože leží na apexu. Výsledkem byly dva falešně pozitivní a dva falešně negativní řádky zároveň — a `STATE.md` podle nich rok nesl špatný stav DNS.
Zvažované alternativy: filtrovat jen `;;` řádky a nechat chybu splývat s prázdnem (tichá porucha by se vrátila); používat veřejný resolver natvrdo (u interních domén by to lhalo jinak); odvozovat registrovatelnou domény přes public suffix list (do skriptu na curl a openssl se to nevejde — proto odhad „bez `www.`" plus ruční přebití).
Přijaté riziko: odhad apexu je `${DOMAIN#www.}`. U hostů s víc úrovněmi (`app.klient.example.com`) nebo u veřejných sufixů typu `co.uk` se musí předat `AUDIT_APEX`, jinak se skript ptá na špatné jméno — tentokrát ale aspoň napíše, na jaké. Job `headers` v CI teď může spadnout na nedostupném DNS runneru; **neopravovat to vrácením fail-open chování**.
Revize: když se audit začne pouštět na jinou doménu než `zakaziq.cz`, nebo při příští úpravě skriptu.
