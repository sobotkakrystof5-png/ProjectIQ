# ZakazIQ Workspace — plán realizace spuštění

> Plán, **jak** se dostat od stavu „hotové v kódu a ověřené na Preview" k veřejnému spuštění. Kontrolní seznam *co* musí platit je v [`LAUNCH.md`](LAUNCH.md); postupy nastavení služeb v [`SETUP.md`](SETUP.md). Tenhle dokument je řadí do pořadí, přiděluje práci a hlídá závislosti.
>
> **Stav k:** 2026-10-31 · větev `ws/redesign-app` · produkce běží na starém `main` (`d948400`), nic z Workspace tam není.
> **Značky:** **[K]** dělá Kryštof (účty, identita, DNS, rozhodnutí, ostré karty) · **[C]** dělá agent (kód, texty, ověření, zápisy do paměti) · **[K+C]** společně.
> Tajné hodnoty se do repa, paměti ani sem nikdy nepíší (jen názvy proměnných).

---

## 1. Východisko

| Oblast | Stav |
|---|---|
| Kód Workspace + landing | S00–S18 a RD01–RD14, RD16 hotové; RD15 (vizuální audit) rozpracovaný |
| Testy a build | `npm test`: 588 prošlo, 1 přeskočený; `npx tsc --noEmit` čistý; `npx next build --webpack` úspěšný, 47/47 stránek (2026-10-31) |
| Závislosti | `npm audit` a `npm audit --omit=dev --audit-level=high`: 0 zranitelností po aktualizaci lockfile (2026-10-31); CI audit je znovu blokující podle rozhodnutí #006 |
| Preview `ws/redesign-app` | testovací Neon, Clerk dev, Stripe sandbox; přihlášený průchod hlavními obrazovkami 2026-10-31 v pořádku |
| Produkční Neon | migrace 064–091 aplikované; práva `ws_app` po 2026-10-31 neověřená |
| Clerk | jen dev instance, `force_organization_selection=false` nastaveno jen tam |
| Stripe | jen sandbox „ZakazIQ"; live produkt, cena, klíče a webhook chybí |
| Resend | doména `zakaziq.cz` neověřená → e-maily Workspace nechodí (`WS_EMAIL_FROM` nenastaveno) |
| DNS (WEDOS) | bez SPF, DMARC, CAA (DNSSEC neověřeno) |
| Právní věci | právní texty a úplné právní jméno/adresa chybí; IČO `29977231` a podpora `info@vizeon.cz` potvrzené 2026-10-31 |

## 2. Principy plánu

1. **Nejdřív to, co trvá a závisí na vnějšku:** aktivace Stripe live, právní texty, propagace DNS. Kód čeká na ně, ne naopak.
2. **Měkký start.** Produkce se nasadí, ale prvním uživatelem je pilotní klient pozvaný z adminu (`/dashboard/klienti`, S17). Veřejnou registraci z landing page pustit až po úspěšném pilotu.
3. **Jedna dávka DNS záznamů** (Resend, Clerk, CAA, SPF/DMARC), ať se do WEDOS nechodí třikrát.
4. **Prostředí se nemíchají.** Live klíče (Clerk, Stripe) jen do Vercel **Production**; Preview a `.env.local` zůstávají na sandboxu a testovací DB.
5. **Změny externích služeb a produkční DB jen s výslovným souhlasem** (AGENTS.md). Agent připravuje příkazy a kontroly; zápisové kroky dělá po schválení nebo je dělá Kryštof.
6. **Nic se nevydává za hotové bez ověření.** Každá stopa končí kontrolou s doloženým výsledkem (viz „Kritérium hotovo").

## 3. Rozhodnutí potřebná před startem (Fáze 0)

| # | Rozhodnutí | Doporučení | Blokuje |
|---|---|---|---|
| D1 | Hlavní host: apex `zakaziq.cz`, nebo `www.zakaziq.cz` | **`www.zakaziq.cz`** (Kryštof, 2026-11-01, R-075); apex přesměrovává na www. Stripe webhook nenásleduje přesměrování (SETUP.md). `NEXT_PUBLIC_APP_URL` = `https://www.zakaziq.cz` (R-055) | webhooky, canonical, sitemap |
| D2 | Provozovatel: jméno, IČO, adresa sídla | IČO `29977231`, obec Dobšín (Kryštof, 2026-10-31); celé právní jméno a úplná adresa sídla chybí | Stripe live, právní texty, faktury |
| D3 | E-mail podpory | `info@vizeon.cz` (Kryštof, 2026-10-31) | landing, Stripe, podmínky |
| D4 | Pilotní klient | Firma a způsob onboardingu stále otevřené | spuštění (LAUNCH.md) |
| D5 | Zrušení účtu: vracet poměrnou část předplatného? | **Ke konci zaplaceného období, bez vrácení** (Kryštof, 2026-11-01, R-074); kód a podmínky upraveny, migrace 097. Customer Portal ve Stripe live nastavit na zrušení ke konci období | podmínky |
| D6 | Pilotní klient platí / sleva (kupón ve Stripe)? | Pilot zdarma (Kryštof, 2026-10-31); délku a způsob nastavení ve Stripe ještě určit | Stripe live, první platba |
| D7 | Podpora: kdo hlídá požadavky, incidenty a selhání plateb a do kdy odpovídá | Kanál `info@vizeon.cz` a formulář na landing; odpověď do 24 hodin. Formulář ukládá dotazy do Hovorů (`/dashboard/calls`); odpovědná osoba a dohled nad incidenty/platbami k potvrzení | spuštění |

Částečná rozhodnutí z 2026-10-31 jsou zapsaná v `memory/memory.md` jako R-065/R-066. Zbývající položky zapíšeme po potvrzení.

---

## 4. Fáze 1 — paralelní stopy (začít všechny hned)

```
A Právní + IČO ─────────────────────────────────────────────┐
B DNS (WEDOS) ──┬─ C Resend ─────────────────┐              │
                └─ D Clerk produkce ─────────┤              ├─► Fáze 2 → 3 → 4
E Stripe live (aktivace účtu trvá dny) ──────┘──────────────┘
```

### Stopa A — provozovatel a právní texty (nejdelší)

| Krok | Kdo | Detail |
|---|---|---|
| A1 | K | Doplnit IČO, adresu, e-mail podpory (D2, D3) |
| A2 | C | Předvyplnit podklady pro právní stránky: lhůty z S18 (R-054 GDPR: výmaz, 10 let faktury, 30 dní po zrušení), seznam zpracovatelů (Vercel, Neon, Clerk, Stripe, Resend), regiony (Resend EU/Irsko; **region Neonu a Vercelu dohledat v dashboardech** — dnes `[DOPLNIT]`) |
| A3 | K | Obchodní podmínky, zásady ochrany údajů a zpracovatelskou smlouvu musí napsat/projít právník nebo Kryštof. Agent text nevymýšlí (AGENTS.md: žádná vymyšlená fakta) |
| A4 | C | Vložit texty do `/podminky`, `/ochrana-udaju`, `/zpracovatelska-smlouva`; odstranit `LEGAL_ROBOTS` (`components/marketing/seo.ts`), přidat stránky do `app/sitemap.ts`; vyplnit `[DOPLNIT]` v landing Dotazech (kde jsou data uložená) |
| A5 | C | Doplnit IČO a adresu do Stripe šablony faktury, Public details a patičky dokladů; aktualizovat záznam o zpracování |
| A6 | C | `humanize-text-cs` a `zakaziq-ux-texty-cs` nad novými texty (ne nad právním textem samotným) |

**Hotovo, když:** v kódu a na landing nezůstane žádné `[DOPLNIT]` (kontrola `grep -rn "DOPLNIT" app components lib docs/landing`), právní stránky jsou v sitemapě a bez `noindex`.

### Stopa B — DNS u WEDOS (jedna dávka)

| Záznam | Hodnota | Zdroj |
|---|---|---|
| CAA (apex) | `0 issue "letsencrypt.org"` a `0 issue "pki.goog"` (ověřeno 2026-11-01: Vercel vydává přes Let's Encrypt, Clerk přes Let's Encrypt nebo Google Trust Services). **Přidat až po vydání certifikátů Clerku** (`clerk deploy status` → complete), jinak hrozí zaseknuté vydávání | [Vercel troubleshooting](https://vercel.com/docs/domains/troubleshooting), [Clerk production](https://clerk.com/docs/guides/development/deployment/production) |
| TXT apex (SPF) | `v=spf1 -all`, **pokud na doméně nebude běžná pošta** (`podpora@`); jinak SPF podle poskytovatele pošty | STATE.md |
| MX + TXT `send` | MX `send` → `feedback-smtp.eu-west-1.amazonses.com` (10), TXT `send` = `v=spf1 include:amazonses.com ~all` | **přesné hodnoty z Resend dashboardu** |
| TXT `resend._domainkey` | DKIM klíč | Resend dashboard |
| TXT `_dmarc` | `v=DMARC1; p=none; rua=mailto:info@vizeon.cz` | SETUP.md |
| CNAME pro Clerk | `clerk`, `accounts`, `clkmail`, `clk._domainkey`, `clk2._domainkey` (přesný seznam ukáže Clerk po `clerk deploy`) | Clerk dashboard |
| DNSSEC | zapnout u WEDOS, DS záznam (pokud WEDOS podporuje) | STATE.md |

Postup: **[C]** sestaví přesnou tabulku, jakmile **[K]** založí doménu v Resendu a produkční instanci v Clerku (hodnoty jsou tam). **[K]** záznamy zadá. **[C]** ověří `dig +short TXT/CNAME/MX/CAA …` (opakovaně, propagace trvá minuty až hodiny).

**Pozor:** apex A/ALIAS a `www` ukazují na Vercel a nesmí se při úpravách rozbít; před změnou si poznamenat současné záznamy.

**Stav 2026-11-01 (`dig`):** NS WEDOS; apex A `216.198.79.1` (Vercel); `www` CNAME `…vercel-dns-017.com`; apex bez TXT, MX a CAA; `_dmarc` ani `clerk` neexistují. Resend: doména `zakaziq.cz` Verified (Kryštof, 2026-11-01); `_dmarc` zatím chybí. Clerk: `clerk deploy status` = `not_started`, `clerk deploy` vyžaduje interaktivní terminál.

### Stopa C — Resend (závisí na B)

| Krok | Kdo | Detail |
|---|---|---|
| C1 | K | ~~Resend → Domains → Add `zakaziq.cz`, region **EU (Irsko)**~~ hotovo 2026-11-01 |
| C2 | K | ~~Záznamy z Resendu do stopy B; „Verified"~~ hotovo 2026-11-01 (DMARC `_dmarc` ještě chybí) |
| C3 | C | ~~Vercel Production: `WS_EMAIL_FROM=rezervace@zakaziq.cz`~~ hotovo 2026-11-01. **Preview záměrně ne**: běží na ukázkových datech s `@example.cz`, odesílání by tvořilo nedoručitelné e-maily a kazilo reputaci domény |
| C4 | C | ~~Webhook `https://www.zakaziq.cz/api/resend/webhook`~~ založen přes API 2026-11-01 (id `2a38645c…`), **vypnutý do nasazení**: webhooky Resendu platí pro celý účet a dnešní produkce cestu nemá (404). Při nasazení zapnout (`PATCH /webhooks/{id}` `status: enabled`) |
| C5 | K→C | ~~`RESEND_WEBHOOK_SECRET` do Vercelu Production~~ hotovo 2026-11-01. Zbývá: samostatný klíč s právem Sending access jen pro `zakaziq.cz` místo dnešního plného `RESEND_API_KEY` (ten sdílí waitlist Startupu) |
| C6 | K+C | Z Nastavení › E-maily poslat zkušební e-maily všech typů na Gmail, Outlook (hotmail) a Apple Mail; zkontrolovat doručení do doručené pošty (ne spam), vzhled, odkaz „Potvrdit" z telefonu, odhlášení |
| C7 | C | Ověřit frontu: odeslaná zpráva dostane stav `sent`, simulovaný bounce přijde webhookem a označí zprávu |

**Hotovo, když:** e-maily z `rezervace@zakaziq.cz` dorazí do 3 klientů poštou mimo spam a bounce webhook odpovídá 200.

### Stopa D — Clerk produkce (závisí na B)

| Krok | Kdo | Detail |
|---|---|---|
| D1 | K | `clerk deploy` → produkční instance, doména `clerk.zakaziq.cz` (CNAME do stopy B) |
| D2 | K | Google Cloud Console → vlastní OAuth klient (redirect URI z Clerku); údaje vložit do Clerku (sdílené dev údaje v produkci nepoužít) |
| D3 | C | `clerk config patch`: `organization_settings.force_organization_selection=false` (jinak Clerk obejde průvodce `/w/novy`, R-037, stalo se 2026-10-31 na dev); česká lokalizace; ověřit, že platí i čeština e-mailů s kódem (jinak Customization → Emails) |
| D4 | C | Zjistit, jestli jde na našem plánu zvednout limit 5 členů organizace (R-020 slibuje neomezeně pracovníků; pracovníci ve `ws.staff` se přihlašovat nemusí) |
| D5 | K | Webhook `https://www.zakaziq.cz/api/clerk/webhook`, události `organization.updated`, `organizationMembership.*`; podpisový klíč → `CLERK_WEBHOOK_SECRET` |
| D6 | C | Vercel **Production**: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live_…`), `CLERK_SECRET_KEY` (`sk_live_…`), `CLERK_WEBHOOK_SECRET`. **Preview zůstává na dev klíčích** |
| D7 | C | CSP: host Frontend API se bere z publishable key sám (`clerkFrontendApiHost`, CSP-LOG); po nasazení ověřit konzoli na `/w/prihlaseni` a `/w/registrace` (Turnstile, Google přihlášení). Případná změna CSP = zápis do `CSP-LOG.md` ve stejném commitu, bez oslabení |

**Hotovo, když:** na produkční doméně projde registrace e-mailem i Googlem, průvodce `/w/novy` se otevře (ne anglický krok Clerku) a webhook vrací 200.

### Stopa E — Stripe live (aktivace trvá dny, začít hned)

| Krok | Kdo | Detail |
|---|---|---|
| E1 | K | Aktivovat účet pro live mód (identita, bankovní účet, údaje z D2) |
| E2 | K+C | Live: produkt „ZakazIQ", cena 249 Kč / měsíc, bez Stripe Tax a bez `tax_behavior` (R-018, neplátce DPH). Příkazy jako v SETUP.md § 2, ale na live účtu → `STRIPE_PRICE_MONTHLY` |
| E3 | K | Omezený klíč `rk_live_…`: Customers Write, Checkout Sessions Write, Customer portal Write, Subscriptions Read, Invoices Read, ostatní None |
| E4 | K | Nastavení dashboardu (SETUP.md § 4): Public details (IČO, e-mail podpory), Branding (`#23478b`), karta + Apple/Google Pay, Customer Portal (zrušení ke konci období, změna tarifu vypnutá, odkazy na podmínky), **připomínka 7 dní před koncem zkušební doby zapnout** (landing ji slibuje), e-mail o neúspěšné platbě, Smart Retries, po vyčerpání pokusů zrušit předplatné, účtenky, šablona faktury (patička „Nejsem plátce DPH.", předčíslí `ZIQ`) |
| E5 | K | Webhook `https://www.zakaziq.cz/api/stripe/webhook` (**s `www`**), 9 událostí z SETUP.md § 5 / `HANDLED_EVENTS` |
| E6 | C | Vercel **Production**: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (nový klíč z E5 — dnešní hodnota nepatří žádnému skutečnému endpointu). Preview zůstává na sandboxu |
| E7 | K | D6: kupón pro pilotního klienta, pokud se rozhodne pro slevu |
| E8 | C | Dokončit sandbox scénáře z SETUP.md § 6 (konec zkušební doby, neúspěšná platba, lhůta, zrušení, obnovení) — dnes dokončena jen registrace → Checkout bez zadané karty |

**Hotovo, když:** sandbox scénáře 1–5 prošly a v live módu je produkt, cena, portál a webhook (test události „Send test webhook" vrací 200).

---

## 5. Fáze 2 — produkční prostředí (po stopách A–E)

| Krok | Kdo | Detail |
|---|---|---|
| P1 | C | Projít proměnné ve Vercel Production proti `.env.example` (jen **názvy** a přítomnost): `DATABASE_URL_WS`, `DATABASE_URL`, `WS_KEY_PEPPER`, `NEXT_PUBLIC_APP_URL` (= host z D1), `NEXTAUTH_*`, `CRON_SECRET`, Clerk, Stripe, Resend, `WS_EMAIL_FROM`, `ANTHROPIC_API_KEY` |
| P2 | C | Preview: potvrdit, že nemá live klíče a míří na testovací DB |
| P3 | C+K | Produkční DB čtením katalogu (připojení vlastníka má Kryštof): všechny migrace do 091, funkce a `EXECUTE` pro `ws_app` (`business_scope`, `money_issue`, `money_adopt_visit`, `money_pay`, `money_unpay`, GDPR funkce). Pokud chybí, `node scripts/ws-create-role.js` pouští **Kryštof** nebo po schválení agent — na testovací DB právě tohle chybělo a Preview padalo |
| P4 | K | Neon: potvrdit retenci záloh (point-in-time restore), provést test obnovy do větve; **C** zapíše postup, datum a výsledek bez klientských dat (LAUNCH.md) |
| P5 | C | Test oddělení dvou účtů na nasazené roli `ws_app` (RLS, složené klíče) — nad pilotními daty ne, jen na prázdných testovacích účtech |
| P6 | C | Cron: `vercel.json` (`ws-email` 5:00 UTC, `ws-gdpr`, `ws-segments`) + `CRON_SECRET` ve Vercelu; po nasazení ověřit v logu první běh |
| P7 | K | GitHub Actions: `SITE_URL` pro bezpečnostní CI job |

## 6. Fáze 3 — ověření před merge

| Krok | Kdo | Detail |
|---|---|---|
| V1 | C | `npm test`, `npx tsc --noEmit`, `npm run build:check` |
| V2 | C | **Admin po Next 16 a `proxy.ts`** — největší skryté riziko. Větev mění celé repo (R-053), ale admin NextAuth s daty nikdo neověřil (Preview má DB bez admin tabulek). Ověřit lokálně nebo na samostatném Preview s kopií admin dat: přihlášení `/login`, `/dashboard`, `/alteno`, `/hub`, `/p/[token]`, `/dashboard/klienti` (pozvání), veřejná booking API (`/api/public/booking/**`, `alteno-leads`, `leads`, `agent-leads`), crony. Admin se nesmí rozbít — produkce je jeho osobní nástroj |
| V3 | C | `web-security-review` nad celým rozdílem proti `main`; zápisy do `.claude/security/`, `sync-agent-context.mjs --write` a `--check` |
| V4 | C | Dependency audit (`npm audit`); po aktualizaci lockfile oba audity hlásí 0 zranitelností (2026-10-31) |
| V5 | K | Telefon 390 px (Chrome i Safari): registrace → průvodce → poptávka přes `/r` → potvrzení → zákazník → faktura/PDF → e-mail → portál `/z`. Doplnit dokončení RD15 |
| V6 | C | Drobnosti z paměti: ceny ve službách ze šablon oborů (`lib/ws/templates/`), vzhled PDF okem (QR, 1 strana), přijatá PDF s AI přepisem |
| V7 | K+C | Test s člověkem, který aplikaci neviděl: do 3 minut od registrace k první poptávce (kritérium „začátek do 3 minut") |
| V8 | C | GDPR na testovacím účtu: export ZIP, výmaz zákazníka, zrušení a obnovení účtu, cron `ws-gdpr` |
| V9 | K | PWA: instalace na Android a iPhone |

**Hotovo, když:** V1–V4 zelené, V2 doloženo seznamem ověřených adres, V5 a V7 bez blokujících nálezů.

**Stav V1 + V4 (2026-10-31): hotovo.** Testy 588/588 mimo 1 očekávaně přeskočený, TypeScript a produkční Webpack build prošly (47/47 stránek). Závislostní audit je čistý; `.github/workflows/security.yml` nyní blokuje high/critical nálezy. V3 (veřejné vstupy, webhooky, cron) proběhl 2026-10-31 bez nálezu „opravit hned“, viz `.claude/security/AUDIT-LOG.md`. V2 jen částečně: na lokálním serveru se testovací DB `/login` a `/` vrací 200, `/dashboard`, `/alteno`, `/hub` a `/dashboard/klienti` přesměrují na přihlášení stejně jako na `main` (`withAuth` beze změny), crony bez tajemství 401, webhook 405 na GET; `/p/[token]` dává 500, protože testovací DB nemá admin tabulky. Přihlášení a data adminu ověřit zbývá. Ruční ověření zůstává otevřené.

## 7. Fáze 4 — nasazení (jen s výslovným souhlasem Kryštofa)

| Krok | Kdo | Detail |
|---|---|---|
| N1 | K | Souhlas s merge `ws/redesign-app` → `main`. **Push na `main` = produkční deploy**, žádný force ani `--no-verify` |
| N2 | C | Po deployi: `regions: fra1` v nasazení (Vercel `get_deployment`), canonical, `robots.txt`, `sitemap.xml`, `security.txt`, hlavičky a CSP (`/w`, `/r`, `/z`, landing vynucená; admin Report-Only), konzole bez chyb CSP |
| N3 | C | `web-security-audit` na `www.zakaziq.cz`; výsledek do `.claude/security/AUDIT-LOG.md` |
| N4 | K | Sitemapa do Google Search Console a Bing Webmaster Tools; Rich Results Test schématu |
| N5 | K | Pozvat pilotního klienta z `/dashboard/klienti`, projít první den společně |
| N6 | K+C | První ostrá platba (249 Kč, nebo kupón) ověří řetěz Clerk → Stripe Checkout → webhook → přístup → e-mail. **C** po ní zkontroluje `trialing`, doklad, doručení |
| N7 | K | Rollback připraven: Vercel „Instant Rollback" na `d948400` (poznamenat ID nasazení před mergem) |

## 8. Fáze 5 — provoz prvních 14 dní

| Co | Jak často | Kdo |
|---|---|---|
| Runtime chyby a logy ve Vercelu | denně | C (`get_runtime_errors`) |
| Selhané webhooky Stripe, Clerk, Resend | denně | K+C |
| Fronta `ws.outbound_messages` (čekající, selhané) | denně | C |
| Registrace a zpětná vazba pilotního klienta | denně | K |
| Podpora podle D7 | průběžně | K |
| DMARC reporty → zpřísnit `p=none` na `quarantine`, později `reject` | po 2–4 týdnech | K+C |
| Zápis data spuštění do `memory/memory.md` a auditu do `AUDIT-LOG.md` | po 14 dnech | C |
| Veřejná registrace z landing page | až po úspěšném pilotu | K |

---

## 9. Kritická cesta a rizika

| Riziko | Dopad | Opatření |
|---|---|---|
| Právní texty a IČO nejsou včas | blokuje Stripe live i spuštění | stopa A hned; nezačíná se kódem |
| Aktivace Stripe live trvá dny | posun spuštění | E1 první den |
| **Admin se rozbije po Next 16** | pád osobního produkčního nástroje | V2, rollback N7 |
| `NEXT_PUBLIC_APP_URL` neodpovídá hlavnímu hostu | Checkout vrací na špatnou adresu, špatný canonical | D1, kontrola P1 |
| Live klíče v Preview | skutečné platby při testování | D6/E6: jen Production; kontrola P2 |
| `ws_app` bez práv na produkci | stránky padají (stalo se na testovací DB) | P3 před merge |
| SPF kořene `-all` vs. pošta `podpora@` | pošta z domény padá do spamu | rozhodnout D3 před zadáním SPF; SPF dle poskytovatele pošty |
| Přepsání A/ALIAS záznamů při úpravě DNS | web mimo provoz | zálohovat současné záznamy před zásahem |
| Clerk limit 5 členů | tým větší než 5 přihlášených | D4; pracovníci bez přihlášení nejsou dotčeni |
| CSP blokuje Clerk/Turnstile na produkční doméně | nejde se přihlásit | D7; měnit jen to, co ukáže konzole, nikdy `unsafe-*` |
| Zrušení účtu bez vrácení poměrné části | spor se zákazníkem | D5, text v podmínkách |

**Neřešit před spuštěním:** Tailwind 4 / `npm audit` Tailwind řetězec, oborové podstránky landing, Stripe Connect zálohy, cena za druhý byznys, SMS, `Dockerfile`, legacy `/dashboard/projekty`.

## 10. Pravidla provádění (pro agenty)

- Před každou stopou přečíst `AGENTS.md`, `memory/memory.md` a příslušnou část `SETUP.md`/`LAUNCH.md`.
- Změna bezpečnostní konfigurace (CSP, hlavičky, DNS doporučení) = zápis do `.claude/security/` ve stejném commitu + `node scripts/sync-agent-context.mjs --write`, pak `--check`.
- Každý dokončený krok: odškrtnout v `LAUNCH.md`, zapsat do changelogu v `memory/memory.md` (typ `chore`/`docs`/`db`), nová rozhodnutí jako `R-xxx`.
- Commity česky na větvi `workspace`/`ws/…`: `ws/oblast: co a proč`. Admin neměnit (výjimka jen oprava vzniklá upgradem, se souhlasem).
- Nic neposílat do externích služeb (Resend, Clerk, Stripe, Vercel env, produkční DB) bez souhlasu pro daný krok.

## 11. Kritérium „připraveno ke spuštění"

Všechny položky označené **Blokuje spuštění** v [`LAUNCH.md`](LAUNCH.md) jsou odškrtnuté a doložené, V2 (admin) je ověřen, N7 (rollback) je připraven a Kryštof výslovně schválil merge a deploy.
