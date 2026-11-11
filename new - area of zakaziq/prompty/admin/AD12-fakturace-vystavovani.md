# AD12 — Fakturace: vystavování faktur v adminu

## Cíl
Fakturu vystavíš přímo v adminu do 30 sekund. Archiv cizích PDF funguje dál beze změny.

## Než začneš
Rituál začátku. Přečti plán sekci 5 (AD12), `docs/FINANCE_SYSTEM_PLAN.md` → Zafixovaná rozhodnutí,
`docs/workspace/MONEY.md`, R-011, R-049, R-061, R-064 v `memory/memory.md`.
Skilly: `zakaziq-workspace-backend`, `web-security-review`.
Soubory: `migrations/053_invoices.sql`, `migrations/080_ws_penize_provoz.sql`,
`migrations/088_*` (vzor `money_pay`/`money_unpay`), `lib/invoices.ts`, `lib/invoice-ai.ts`,
`app/hub/finance/invoice-actions.ts`, `components/Invoice*.tsx`, `lib/ws/money/{pdf,schema,calculations}.ts`,
`next.config.mjs`.

Dnešní stav: admin faktury **nevystavuje**. `invoices` je archiv cizích PDF — jedna `amount`, žádné
položky, DPH, dodavatel, šablona, PDF ani e-mail. Číslo faktury je ruční textové pole.

## Kroky
1. **Rozhodnutí: rozšířit `invoices`, ne nové tabulky.** Na `invoices` visí `finance_transaction_id`,
   unique index na číslo, `ai_extracted`, `pdf_data`, celé `invoice-actions.ts` a `/api/public/invoices`.
   Druhá tabulka = dvě evidence a dva výpočty „po splatnosti“.
2. **Migrace 103** (jen připravit): `invoices` + `kind text NOT NULL DEFAULT 'archived'
   CHECK (kind IN ('archived','issued'))`, `items jsonb`, `issuer jsonb`, `supplied_on date`,
   `vat_total numeric`, `number_seq integer`; CHECK „vystavená musí mít `items` a `issuer`,
   1–50 položek“; `UNIQUE (number_seq) WHERE kind='issued'`; tabulka
   `admin_settings (id boolean PK DEFAULT true CHECK (id), invoice_sequences jsonb, issuer_profile jsonb, updated_at)`.
   `DEFAULT 'archived'` je celý trik: **každý existující řádek zůstane archivem** a dnešní obrazovky
   se nemění.
3. **Atomické číslo.** `admin_invoice_issue(p_data jsonb) RETURNS uuid` podle `ws.money_issue`:
   `SELECT invoice_sequences … FOR UPDATE` → `GREATEST(uložené, MAX z invoice_number)+1` → `jsonb_set`
   → `INSERT … RETURNING id`, vše v jedné transakci. Formát `YYYY-NNNNNN`. Test souběhu nad PGlite.
4. **Profil dodavatele** v `admin_settings.issuer_profile` (IČO, adresa, IBAN pro QR, „nejsem plátce
   DPH“ — R-011, R-018); na dokladu **snímek** v `issuer jsonb`, aby pozdější změna profilu neměnila
   starší faktury.
5. **Položky a součty sdílej, nekopíruj:** `lib/ws/money/calculations.ts` je čistá funkce v haléřích.
   Měny nikdy nesčítej.
6. **PDF.** Z `lib/ws/money/pdf.ts` vytáhni `lib/invoice-pdf/render.ts` s úzkým vstupem (dodavatel,
   odběratel, položky, součty, QR, logo); volají ho Workspace i admin. **Do `next.config.mjs` přidej**
   `'/api/invoices/*/pdf': ['./node_modules/@sparticuz/chromium/bin/**/*']` — admin dnes Chromium
   v žádné funkci nemá a bez toho PDF spadne až na produkci. PDF jen v route handleru, nikdy
   v server action stránky. QR přes `spaydPaymentString()` a balíček `qrcode` (R-064: na serveru
   bez React komponent s hooky).
7. **ARES.** Nový `lib/ares.ts`, serverový `fetch` na REST ARES podle IČO. **Endpoint ověř, neodhaduj.**
   CSP se nemění (volá server, ne prohlížeč), ale je to **nová vnější závislost** → rozhodnutí
   **R-086** v paměti + zápis do `.claude/security/DECISIONS.md`: timeout 3 s, bez redirectů, odpověď
   přes Zod, nikdy do `innerHTML`, cache 24 h, IČO ověř kontrolní číslicí mod 11 před voláním,
   selhání **nikdy** neblokuje formulář.
8. **Předvyplnění:** číslo samo, splatnost +14, odběratel a IČO z poslední faktury téhož kontaktu
   (AD09) nebo z ARES, částka ze zakázky (`price` − zaplacená záloha).
9. **E-mail faktury:** `lib/email.ts` + `after()`, výslovné tlačítko, nikdy automaticky.
10. `web-security-review` před commitem.

## Hotovo, když
- Fakturu vystavíš do 30 s, PDF s QR se vygeneruje a otevře.
- Test souběhu: dvě současná vystavení nedají stejné číslo ani díru v řadě.
- Archiv cizích PDF, AI přepis a `syncInvoiceTransaction` mají test, že se chovají beze změny.
- Migrace 103 připravená (aplikována: ne), R-086 v paměti.

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD12 v plánu, changelog, `AGENTS-ADMIN.md`.
Commit `admin/fakturace: vystavování faktur, PDF s QR, profil dodavatele`.
