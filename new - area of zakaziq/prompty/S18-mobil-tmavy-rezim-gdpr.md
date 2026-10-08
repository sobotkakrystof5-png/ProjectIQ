# S18 — Mobil, tmavý režim, GDPR

## Cíl
Aplikace je pohodlná na telefonu jednou rukou, má tmavý režim a splňuje GDPR (export, výmaz,
souhlasy, zpracovatelská smlouva).

## Než začneš
Rituál začátku. Načti `zakaziq-design-dilky`, `zakaziq-workspace-backend`, `zakaziq-ux-texty-cs`.
Mockup D (mobil Dnes).

## Kroky
1. **Mobil:** projdi všechny obrazovky na 390 px: spodní lišta, velké klikací plochy, pravý panel
   jako celá obrazovka, kalendář den jako výchozí, gesto „táhni pro obnovení" na Dnes.
   PWA: manifest, ikona z loga, „Přidat na plochu", offline stránka.
2. **Tmavý režim:** tokeny z `tokens.css`, přepínač v Účtu (systém / světlý / tmavý), kontrola
   kontrastu všech obrazovek a e-mailových náhledů.
3. **GDPR:** export všech dat účtu (ZIP s CSV + PDF faktur), výmaz zákazníka na žádost
   (anonymizace v historii a fakturách podle zákona — zeptej se na pravidla, zapiš do
   `memory/memory.md` → Otevřené problémy), souhlas s kontaktováním u zákazníka, záznam o zpracování,
   stránka se zpracovatelskou smlouvou (text `[DOPLNIT]`), zrušení účtu (data drží 30 dní, pak
   výmaz, vše zapsané v podmínkách).
4. **Přístupnost:** klávesnice všude, focus viditelný, `aria` u ikonových tlačítek,
   `prefers-reduced-motion` ověřeno.
5. Test „člověk, který aplikaci neviděl": registrace, přijetí poptávky, vystavení faktury
   na telefonu bez pomoci. Výsledek zapiš do changelogu v `memory/memory.md`.

## Hotovo, když
- Všechny obrazovky fungují na 390 px a v tmavém režimu.
- Export a výmaz fungují a jsou otestované.

## Konec sezení
`zakaziq-memory` → Konec sezení. Commit `ws: mobil, tmavý režim, GDPR`.
