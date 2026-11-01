# KP08 — Soubory a přílohy (volitelné)

## Cíl
Klient může k požadavku nebo projektu přiložit obrázek či dokument (screenshot, logo, podklady) a Kryštof je má u zakázky. Dělá se jen, pokud to Kryštof potvrdí (D-K8).

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 5, 7 (D-K8), 8, výsledky KP07 v paměti, `.claude/security/DECISIONS.md` #013 (obrázek novinky v DB a proč), `next.config.mjs` (limity těla), `lib/ws/news-format.ts` (kontrola obrázku podle bajtů).
Skilly: `zakaziq-workspace-backend`, `web-security-review`, `web-security-memory`.
**Admin:** zadání nepovoluje měnit nic mimo záložku Soubory v detailu zakázky a nový route handler pro stažení.
Než začneš, **zeptej se Kryštofa**, kam se mají soubory ukládat (databáze po malých souborech, nebo externí úložiště) a jaký je strop velikosti. Úložiště je samostatné rozhodnutí a nová závislost se zdůvodňuje v paměti.

## Kroky
1. **Rozhodnutí a model.** Zapiš zvolené úložiště jako R-0xx a migraci (první volné číslo, jen připravit): `portal.files` (firma, projekt, autor, název, typ, velikost, kontrolní součet, odkaz na úložiště), stav `ok`/`zablokováno`.
2. **Nahrání.** Povolené typy podle bajtů (PNG, JPEG, WebP, PDF; ostatní odmítnout), strop velikosti, počet souborů na požadavek a na projekt, přejmenování na náhodný název, původní jméno jen jako popisek (očištěné). Žádné spustitelné, SVG ani HTML soubory.
3. **Stahování.** Jen přes route handler s ověřením členství; `Content-Disposition: attachment` pro vše kromě obrázků, `X-Content-Type-Options: nosniff`, žádná veřejná adresa souboru. Kryštof stahuje z adminu přes ověřenou session.
4. **UI.** Přiložení u požadavku (přetažení i výběr, telefon: fotoaparát/galerie), seznam příloh s náhledem obrázků. Texty obyčejně česky.
5. **Soukromí.** Soubory patří do retence (D-K10) a do výmazu na žádost; zapiš do GDPR postupu (KP10).
6. **Testy:** špatný typ podle bajtů odmítnut i s věrohodnou příponou; velikost; cizí firma soubor nestáhne; název souboru s lomítky nebo zalomením neprojde; limity počtu.
7. **Paměť.** `web-security-review`, `DECISIONS.md`, `CSP-LOG.md` pokud se mění `img-src`/`connect-src` (bez wildcardů), changelog, referenční dokumentace, stav v plánu.

## Hotovo, když
- Klient přiloží obrázek k požadavku, Kryštof ho vidí v zakázce a může stáhnout; cizí firma ne.
- Zakázané typy a příliš velké soubory jsou odmítnuté s českou hláškou.
- Testy a `tsc` procházejí; rozhodnutí o úložišti zapsáno.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit na požádání, např. `ws/klient: přílohy k požadavkům`.
