# S11 — Veřejné API, objednávací stránka a widget

## Cíl
Poptávky z webů klientů tečou samy do účtu. Tři cesty: (1) web postavený v Claude Code přes
tajný klíč, (2) objednávací stránka `/r/[slug]` + QR kód, (3) jednořádkový widget pro cizí weby.

## Než začneš
Rituál začátku. Načti `zakaziq-workspace-backend` (sekce Veřejné API), `zakaziq-design-dilky`,
`zakaziq-ux-texty-cs`. Inspirace v kódu: `lib/web-booking.ts`, `lib/api-auth.ts`,
`lib/api-rate-limit.ts`, `types/booking.ts` (kopírovat do `lib/ws/intake/`, originály neměnit).
Bezpečnostní pravidla z `.claude/security/` (CORS, frame-ancestors).

## Kroky
1. `lib/ws/keys.ts`: veřejný klíč `pk_live_…`, tajný `sk_live_…` (zobrazí se jednou, uloží se
   jen SHA-256 hash s pepperem), rotace klíče.
2. `GET /api/public/v1/schema` a `POST /api/public/v1/requests` přesně podle skillu (rate limit,
   ověření klíče, Zod z kolonek, zákazník, uložení, `202`, notifikace až potom, idempotence,
   kódy chyb). Funguje i při neaktivním předplatném (uloží se, e-maily zákazníkovi ne).
3. **Objednávací stránka `/r/[slug]`**: služba → volný termín → kontakt → hotovo, ve stylu Dílků
   s logem a akcentem byznysu, mobil napřed, bez přihlášení. QR kód ke stažení (PNG/SVG pro tisk).
4. **Widget `/embed/[slug].js`**: malý skript (bez frameworku, < 15 kB gzip), vykreslí tlačítko
   nebo vložený formulář v shadow DOM, posílá s veřejným klíčem; kontrola `Origin`.
5. **Nastavení › Napojený web** (`/w/[business]/nastaveni/web`):
   - **„Zkopírovat prompt pro Claude Code"** — vygeneruje prompt s adresou API, názvem env
     `ZAKAZIQ_KEY`, aktuálními službami a kolonkami (JSON) a zadáním: formulář ve stylu webu,
     server action, validace, děkovná zpráva, test. Text promptu: `lib/ws/intake/claude-prompt.ts`.
   - tajný klíč (zobrazit jednou, rotovat), povolené domény, odkaz + QR, kód widgetu;
   - **„Ověřit napojení"** (pošle zkušební poptávku označenou `is_test` a ukáže zelenou fajfku),
     **„Poslat návod webáři"** (e-mail s postupem);
   - posledních 20 příchozích požadavků (čas, zdroj, výsledek) pro ladění.
6. Dokumentace API v `docs/workspace/API.md` (česky, s příklady pro Next.js server action
   a pro `curl`) — z ní čerpá skill `zakaziq-napojeni` pro klientské weby.
7. Testy: platný/neplatný klíč, cizí doména, rate limit, validace kolonek, idempotence,
   neaktivní předplatné.

## Hotovo, když
- Testovací Next.js stránka s promptem z aplikace pošle poptávku a ta se do 15 s objeví v Dnes.
- Objednávací stránka a widget fungují na telefonu i na cizí doméně (povolené) a jinde ne.
- Tajný klíč se nikde neloguje ani nezobrazuje znovu.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws/intake: veřejné API, objednávání, widget`.
