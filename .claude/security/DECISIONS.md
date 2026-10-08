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
