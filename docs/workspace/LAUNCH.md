# ZakazIQ — kontrolní seznam před spuštěním

Pořadí, rozdělení práce a rizika: [LAUNCH-PLAN.md](LAUNCH-PLAN.md).

Stav k 2026-11-03. Položky označené **blokuje spuštění** musí být hotové a doložené
před veřejným spuštěním. Vercel eviduje `zakaziq.cz` i `www.zakaziq.cz` jako ověřené
domény projektu `project-iq`; produkce stále běží ze staršího `main`.

## Bezpečnost a nasazení

- [x] CSP vynucená v kódu pro všechny profily; `/login` je dynamický, aby Next.js doplnil nonce.
- [ ] Lokálně ověřit přihlášení do adminu, statické/chybové stránky a stránky s externím obsahem pod CSP.
- [ ] Preview `https://project-pnfallur8-sobotkakrystof5-pngs-projects.vercel.app` je READY a sestavilo se; Chrome načetl landing page. Konzole hlásila chybu konfigurace NextAuth. Přihlášení a Workspace ověřit po doplnění Preview env; Safari zůstává ruční krok.
- [x] Spustit `security-check.sh` na produkčním `www.zakaziq.cz` a Preview; výsledky jsou v `.claude/security/AUDIT-LOG.md`. Preview audit prošel hlavičkami/CSP; produkce zatím nemá CSP/COOP/CORP.
- [ ] Ověřit TLS, přesměrování apex/www, `security.txt`, CAA a DNSSEC. TLS 1.3 a platný certifikát `www.zakaziq.cz` jsou ověřeny přímo; apex DS/CAA chybí. SPF apexu chybí, DMARC `p=none` bez `rua` (2026-11-03). CAA jde přidat, certifikáty Clerku jsou vydané. Audit hlásil `security.txt` jako nedostupný, ale soubor je v repu i Preview balíčku — ověřit HTTP odpověď po odblokování Preview.
- [ ] Zkontrolovat HSTS preload pro produkční doménu; další zařazení do preload listu řešit samostatně.
- [ ] Nastavit `SITE_URL` v GitHub Actions a ověřit běh bezpečnostního CI jobu.
- [ ] Zkontrolovat chybové hlášení ve Vercelu, selhané Stripe/Clerk/Resend webhooky a doručování e-mailů; určit adresu/kanál upozornění admina.
- [x] Dependency audit (2026-10-31): po `npm audit fix` bez `--force` hlásí `npm audit` i `npm audit --omit=dev --audit-level=high` 0 zranitelností. CI job je znovu blokující podle rozhodnutí #006; výsledek v `.claude/security/AUDIT-LOG.md`.

## Provozní konfigurace

- [x] **Preview větve `ws/redesign-app`** (2026-10-31): stálá adresa `project-iq-git-ws-redesign-app-…vercel.app`, testovací Neon, vlastní `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL` jen pro tuto větev (návrat z Checkoutu). Registrace → průvodce → Checkout sandbox ověřeny; karta nezadána.
- [x] **Preview build:** aktuální pracovní strom sestaven ve Vercelu jako Preview; build i routy doběhly. Zbývá ruční funkční průchod po nastavení Preview env.
- [ ] **Blokuje spuštění:** ověřit všechny produkční proměnné ve Vercelu; zejména databázi `ws_app`, `WS_KEY_PEPPER`, produkční Clerk, Stripe live a Resend. Tajné hodnoty nezapisovat do repa ani do tohoto seznamu.
- [x] Migrace 064–096 na produkci (084 aplikoval Kryštof 2026-10-31, 092–096 2026-11-01); zbývá ověřit čtením katalogu migrace a granty `ws_app` podle `SETUP.md`.
- [ ] **Blokuje spuštění:** vyměnit heslo `neondb_owner`, upravit `DATABASE_URL` ve Vercelu a `.env.local`, pak aplikovat migrace 097–099 na produkci.
- [ ] **Blokuje spuštění:** přejít na Vercel Pro (Hobby je podle podmínek Vercelu jen pro nekomerční použití); rozhodnutí a platba Kryštof.
- [ ] **Blokuje spuštění:** produkční Clerk instance — založená, `clerk.zakaziq.cz` s DNS, SSL a poštou hotové (2026-11-03). Zbývá vlastní Google OAuth klient (consent screen „In production“), `organization_settings.force_organization_selection = false` (jinak Clerk po registraci ukáže anglické „Setup your organization“ a obejde průvodce `/w/novy`), webhook a klíče ve Vercel Production; ověřit přihlášení a registraci.
- [ ] **Blokuje spuštění:** nastavit Stripe live produkt/cenu, omezený klíč, Customer Portal, e-maily a webhook. Dokončit celý sandbox test Checkoutu, změny stavu, neúspěšné platby a zrušení.
- [ ] **Blokuje spuštění:** ověřit doménu v Resendu, SPF/DKIM/DMARC, `WS_EMAIL_FROM` a webhook nedoručených zpráv; doručit test do Gmailu, Outlooku a Apple Mailu. Stav 2026-11-03: doména ověřená, `WS_EMAIL_FROM` a `RESEND_WEBHOOK_SECRET` ve Vercel Production, webhook vypnutý do nasazení, DMARC bez `rua`; zkušební doručení chybí.
- [ ] Doména `zakaziq.cz`: Vercel potvrzuje apex i www jako verified. Produkční security-check proběhl; ověřit apex DNS a e-mailové DNS záznamy ve správě domény.

## Data, obnova a ověření produktu

- [ ] **Blokuje spuštění:** potvrdit Neon zálohování a retenční dobu; provést test obnovy a zaznamenat postup, datum a výsledek bez klientských údajů.
- [ ] **Blokuje spuštění:** ověřit oddělení dvou účtů a role `ws_app` na nasazeném prostředí; žádné testovací účty ani data skutečných klientů nepoužít bez potřeby.
- [ ] Projít hlavní tok v mobilním Chrome a Safari: registrace, poptávka, potvrzení termínu, zákazník, faktura/PDF, e-mail a klientský portál.
- [ ] Ověřit `/w/ucet` export, žádost o výmaz, zrušení/obnovení účtu a denní cron GDPR na bezpečném testovacím účtu.
- [ ] Ověřit veřejný web a Workspace formuláře, rate limity, webhook podpisy/idempotenci, podepsané odkazy a přístup k faktuře.
- [ ] Ověřit dostupné závislosti; aktuálně neověřené ruční části po upgradu Next 16 jsou přihlášení NextAuth/Clerk a PDF faktury.

## Právní a zákaznická připravenost

- [ ] **Blokuje spuštění:** obchodní podmínky, ochrana údajů a zpracovatelská smlouva jsou na webu (R-079, 2026-11-03); volby potvrdil Kryštof 2026-11-03, zbývá doporučená kontrola právníkem.
- [ ] **Blokuje spuštění:** provozovatel (Kryštof Sobotka, Kamenice 64, 294 04 Dobšín, IČO `29977231`) je na webu a v právních textech od 2026-11-03; zbývá doplnit ho do Stripe (Public details, šablona faktury) a daňových dokladů.
- [ ] Potvrdit, že cena 249 Kč/měsíc a 14denní zkušební doba odpovídají Stripe i textům; potvrdit režim DPH a text dokladu „Nejsem plátce DPH“.
- [ ] Aktualizovat záznam o zpracování: provozovatel, regiony a doby uchování pro Vercel, Neon, Clerk, Stripe a Resend.
- [ ] **Blokuje spuštění:** potvrdit konkrétního pilotního klienta a bezpečný postup jeho onboardingu. Pilot bude zdarma; délka a nastavení ještě nejsou určené.
- [ ] **Blokuje spuštění:** určit osobu, která hlídá Hovory (`/dashboard/calls`), incidenty a selhání plateb. Kanál podpory je formulář a `info@vizeon.cz`; Kryštof potvrdil odpověď do 24 hodin (2026-10-31).

## Spuštění

- [ ] Po uzavření blokujících položek provést finální bezpečnostní audit produkční domény a zaznamenat jej.
- [ ] Nasadit produkci až po výslovném schválení Kryštofem; ověřit DNS, sitemapu, canonical a e-mailové toky.
- [ ] Prvních 14 dní denně zkontrolovat chyby, webhooky, frontu e-mailů, registrace a zpětnou vazbu pilotního klienta.
- [ ] Uložit datum spuštění a výsledek do `memory/memory.md` a bezpečnostní audit do `.claude/security/AUDIT-LOG.md`.

## Otevřené po spuštění

- [ ] Zpřísnit DMARC z `p=none` po vyhodnocení reportů.
- [ ] HSTS preload podle ověření a rizik subdomén.
- [ ] Znovu vyhodnotit zranitelné/transitivní závislosti a obnovit blokující CI audit, jakmile nejsou zdůvodněné výjimky.
