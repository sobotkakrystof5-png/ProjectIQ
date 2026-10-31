# ZakazIQ — kontrolní seznam před spuštěním

Stav k 2026-10-17. Položky označené **blokuje spuštění** musí být hotové a doložené
před veřejným spuštěním. Vercel eviduje `zakaziq.cz` i `www.zakaziq.cz` jako ověřené
domény projektu `project-iq`; produkce stále běží ze staršího `main`.

## Bezpečnost a nasazení

- [x] CSP vynucená v kódu pro všechny profily; `/login` je dynamický, aby Next.js doplnil nonce.
- [ ] Lokálně ověřit přihlášení do adminu, statické/chybové stránky a stránky s externím obsahem pod CSP.
- [ ] Preview `https://project-pnfallur8-sobotkakrystof5-pngs-projects.vercel.app` je READY a sestavilo se; Chrome načetl landing page. Konzole hlásila chybu konfigurace NextAuth. Přihlášení a Workspace ověřit po doplnění Preview env; Safari zůstává ruční krok.
- [x] Spustit `security-check.sh` na produkčním `www.zakaziq.cz` a Preview; výsledky jsou v `.claude/security/AUDIT-LOG.md`. Preview audit prošel hlavičkami/CSP; produkce zatím nemá CSP/COOP/CORP.
- [ ] Ověřit TLS, přesměrování apex/www, `security.txt`, CAA a DNSSEC. TLS 1.3 a platný certifikát `www.zakaziq.cz` jsou ověřeny přímo; apex DS/CAA chybí. SPF/DMARC chybí. Audit hlásil `security.txt` jako nedostupný, ale soubor je v repu i Preview balíčku — ověřit HTTP odpověď po odblokování Preview.
- [ ] Zkontrolovat HSTS preload pro produkční doménu; další zařazení do preload listu řešit samostatně.
- [ ] Nastavit `SITE_URL` v GitHub Actions a ověřit běh bezpečnostního CI jobu.
- [ ] Zkontrolovat chybové hlášení ve Vercelu, selhané Stripe/Clerk/Resend webhooky a doručování e-mailů; určit adresu/kanál upozornění admina.
- [ ] Dependency audit: Nodemailer 10.1.2; zbývá 5 high a 2 moderate v řetězci Tailwind 3. Oprava vyžaduje major migraci Tailwindu 4; viz `.claude/security/AUDIT-LOG.md` a rozhodnutí #006.

## Provozní konfigurace

- [x] **Preview větve `ws/redesign-app`** (2026-10-31): stálá adresa `project-iq-git-ws-redesign-app-…vercel.app`, testovací Neon, vlastní `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL` jen pro tuto větev (návrat z Checkoutu). Registrace → průvodce → Checkout sandbox ověřeny; karta nezadána.
- [x] **Preview build:** aktuální pracovní strom sestaven ve Vercelu jako Preview; build i routy doběhly. Zbývá ruční funkční průchod po nastavení Preview env.
- [ ] **Blokuje spuštění:** ověřit všechny produkční proměnné ve Vercelu; zejména databázi `ws_app`, `WS_KEY_PEPPER`, produkční Clerk, Stripe live a Resend. Tajné hodnoty nezapisovat do repa ani do tohoto seznamu.
- [x] Migrace Workspace 064–091 na produkci (084 aplikoval Kryštof 2026-10-31); zbývá ověřit čtením katalogu migrace až do `084_ws_gdpr.sql` a granty `ws_app` podle `SETUP.md`.
- [ ] **Blokuje spuštění:** založit produkční Clerk instanci, v ní `organization_settings.force_organization_selection = false` (jinak Clerk po registraci ukáže anglické „Setup your organization“ a obejde průvodce `/w/novy`), nastavit `clerk.zakaziq.cz`, vlastní OAuth údaje a webhook; ověřit přihlášení a registraci.
- [ ] **Blokuje spuštění:** nastavit Stripe live produkt/cenu, omezený klíč, Customer Portal, e-maily a webhook. Dokončit celý sandbox test Checkoutu, změny stavu, neúspěšné platby a zrušení.
- [ ] **Blokuje spuštění:** ověřit doménu v Resendu, SPF/DKIM/DMARC, `WS_EMAIL_FROM` a webhook nedoručených zpráv; doručit test do Gmailu, Outlooku a Apple Mailu.
- [ ] Doména `zakaziq.cz`: Vercel potvrzuje apex i www jako verified. Produkční security-check proběhl; ověřit apex DNS a e-mailové DNS záznamy ve správě domény.

## Data, obnova a ověření produktu

- [ ] **Blokuje spuštění:** potvrdit Neon zálohování a retenční dobu; provést test obnovy a zaznamenat postup, datum a výsledek bez klientských údajů.
- [ ] **Blokuje spuštění:** ověřit oddělení dvou účtů a role `ws_app` na nasazeném prostředí; žádné testovací účty ani data skutečných klientů nepoužít bez potřeby.
- [ ] Projít hlavní tok v mobilním Chrome a Safari: registrace, poptávka, potvrzení termínu, zákazník, faktura/PDF, e-mail a klientský portál.
- [ ] Ověřit `/w/ucet` export, žádost o výmaz, zrušení/obnovení účtu a denní cron GDPR na bezpečném testovacím účtu.
- [ ] Ověřit veřejný web a Workspace formuláře, rate limity, webhook podpisy/idempotenci, podepsané odkazy a přístup k faktuře.
- [ ] Ověřit dostupné závislosti; aktuálně neověřené ruční části po upgradu Next 16 jsou přihlášení NextAuth/Clerk a PDF faktury.

## Právní a zákaznická připravenost

- [ ] **Blokuje spuštění:** doplnit skutečné obchodní podmínky, zásady ochrany údajů a zpracovatelskou smlouvu; právní texty musí dodat/projít provozovatel nebo právník.
- [ ] **Blokuje spuštění:** doplnit IČO, adresu a kontaktní e-mail podpory do webu, Stripe a daňových dokladů.
- [ ] Potvrdit, že cena 249 Kč/měsíc a 14denní zkušební doba odpovídají Stripe i textům; potvrdit režim DPH a text dokladu „Nejsem plátce DPH“.
- [ ] Aktualizovat záznam o zpracování: provozovatel, regiony a doby uchování pro Vercel, Neon, Clerk, Stripe a Resend.
- [ ] **Blokuje spuštění:** potvrdit prvního pilotního klienta a bezpečný postup jeho onboardingu.
- [ ] **Blokuje spuštění:** určit podporu: kontaktní adresa, kdo hlídá požadavky, incidenty a selhání plateb, a obvyklá doba odpovědi.

## Spuštění

- [ ] Po uzavření blokujících položek provést finální bezpečnostní audit produkční domény a zaznamenat jej.
- [ ] Nasadit produkci až po výslovném schválení Kryštofem; ověřit DNS, sitemapu, canonical a e-mailové toky.
- [ ] Prvních 14 dní denně zkontrolovat chyby, webhooky, frontu e-mailů, registrace a zpětnou vazbu pilotního klienta.
- [ ] Uložit datum spuštění a výsledek do `memory/memory.md` a bezpečnostní audit do `.claude/security/AUDIT-LOG.md`.

## Otevřené po spuštění

- [ ] Zpřísnit DMARC z `p=none` po vyhodnocení reportů.
- [ ] HSTS preload podle ověření a rizik subdomén.
- [ ] Znovu vyhodnotit zranitelné/transitivní závislosti a obnovit blokující CI audit, jakmile nejsou zdůvodněné výjimky.
