# Schůzky z Wispr Flow do ZakazIQ (R-144)

Kryštof nahraje schůzku ve Wispr Flow → ZakazIQ ji dostane i s doslovným přepisem → AI udělá
shrnutí, body dohody, kdo co udělá a pozná klienta → Kryštof potvrdí klienta jedním kliknutím
(chybějící údaje se doplní do kontaktu) → v Gmailu krystof@vizeon.cz čeká koncept e-mailu
se shrnutím. Přepis zůstává jen v ZakazIQ (`/dashboard/schuzky`).

## Jak data tečou

```
Wispr Flow (aplikace na Macu)
  ~/Library/Application Support/Wispr Flow/flow.sqlite          tabulka Meetings
  ~/Library/Application Support/Wispr Flow/meetings/<id>/refined.ndjson   přepis po segmentech
        │
        ▼  scripts/wispr-local-most.mjs (LaunchAgent každou hodinu, bez modelu)
           GET  /api/public/schuzky?ids=…   které už ZakazIQ má
           POST /api/public/schuzky         nová schůzka + přepis slovo od slova
        ▼
ZakazIQ: meeting_notes ─after()─▶ jistá shoda klienta (e-mail účastníka, kalendář)
                                ─▶ AI (smart): shrnutí, dohody, kroky, kandidát
                                ─▶ koncept v Gmailu, když je klient jistý a má e-mail
                                ─▶ zvonek „Přepis schůzky: …"
```

Wispr Flow nemá API ani webhook. Desktopová aplikace si ale drží celé přepisy na Macu, takže je
skript čte přímo ze souborů a posílá je bez modelu — přepis dorazí přesně, jak ho Wispr Flow má.
Most běží, jen když je Mac zapnutý; zmeškané schůzky dobere při dalším běhu (okno 30 dní).
Kdyby neběžel, přepis jde vložit ručně: Schůzky › Vložit přepis (ve Wispr Flow „Copy as Markdown").

**Proč ne naplánovaná úloha Clauda:** první verze mostu (2026-11-25) byla cloudová úloha s konektorem
Wispr Flow, která měla přepis opsat do souboru. Opsání dlouhého textu zastavil bezpečnostní filtr
modelu (blokuje dlouhé doslovné kopie), nedorazilo nic. Filtr se neobchází; úloha
`trig_013Y7qZxCW55vP1K6THsPR55` a prostředí „ZakazIQ most Wispr" jsou vypnuté/nepoužívané.

Co skript čte a posílá:
- jen schůzky `finalized`, `transcriptReady`, nesmazané, nahrávka aspoň 1 minuta a přepis aspoň
  300 znaků (prázdné záznamy a „pokus o spojení" vynechá);
- přepis = řádky `refined.ndjson` jako „Mluvčí: text"; jméno mluvčího ze `speakerMap` (přiřazení
  uživatelem › mikrofon › kalendář › odhad AI), jinak „Speaker N" jako konektor; text se nemění;
- začátek z `calendarOccurrenceStartAtUtc` nebo `createdAt`, konec z `endedAt`, odkaz
  `https://notes.wisprflow.ai/shared/<shareSlug>`, shrnutí Wispr Flow, účastníci = pojmenovaní mluvčí
  (e-maily lokálně nejsou, takže jistá shoda podle e-mailu z mostu nenastane — klienta pozná kalendář
  nebo ho potvrdí Kryštof);
- databázi otevírá jen pro čtení (`sqlite3 -readonly`), nic v datech Wispr Flow nemění.

Pozor: formát lokálních dat Wispr Flow není veřejné rozhraní a může se změnit s aktualizací
aplikace. Pak skript schůzky vynechá nebo nahlásí chybu do záznamu — zkontrolovat
`~/Library/Logs/zakaziq-wispr-most.log` a `node scripts/wispr-local-most.mjs --dry-run`.

## Nastavení (jednou)

1. **Migrace 134** na produkčním Neonu (`migrations/134_schuzky_prepisy.sql`, aditivní) — hotovo 2026-11-25.
2. **Klíč mostu** `MEETING_NOTES_API_KEY`: stejná hodnota ve Vercelu (Production, sensitive) a v Klíčence
   Macu (služba `zakaziq-meeting-notes`, účet `zakaziq`). Výměna jedním příkazem, hodnota se nikde nevypíše:
   ```
   KEY=$(openssl rand -hex 32) && security add-generic-password -U -a zakaziq -s zakaziq-meeting-notes -w "$KEY" \
     && vercel env rm MEETING_NOTES_API_KEY production -y \
     && printf '%s' "$KEY" | vercel env add MEETING_NOTES_API_KEY production --sensitive; unset KEY
   ```
   Pak nasadit znovu (nová hodnota platí až v dalším nasazení).
3. **Gmail API** zapnuté v Google Cloud projektu „ZakazIQ admin" (2026-11-25). V adminu
   **Profil → Google → Propojit znovu**: přibylo oprávnění `gmail.compose` (jen koncepty, kód nic
   neodesílá). Bez toho schůzky fungují, jen koncept nevznikne a detail řekne proč.
4. **Most na Macu:** `node scripts/wispr-local-most.mjs --install` zkopíruje skript do
   `~/Library/Application Support/ZakazIQ/` (mimo repo, ať nezáleží na větvi a na ochraně Plochy)
   a zapne LaunchAgent `cz.zakaziq.wispr-most` (každou hodinu a po přihlášení). Záznam
   `~/Library/Logs/zakaziq-wispr-most.log`. Vypnutí `--uninstall`. Po změně skriptu v repu znovu `--install`.
   Ručně: `--dry-run` (co by poslal, bez obsahu), `--days 90`, `--only <id>,<id>`.

## Co kde je

| Co | Kde |
|---|---|
| Tabulka | `migrations/134_schuzky_prepisy.sql` (`meeting_notes`) |
| Vstup mostu | `app/api/public/schuzky/route.ts` (POST, GET `?ids=`), `types/meeting-notes.ts` |
| Ukládání a čtení | `lib/admin/meeting-notes/store.ts` |
| Kdo to je | `lib/admin/meeting-notes/match.ts` (e-mail účastníka, kalendář ±20 min, kandidáti podle jména) |
| AI | `lib/admin/meeting-notes/ai.ts` (model `smart`, strukturovaný výstup, kandidát jen ze seznamu) |
| Tok a potvrzení klienta | `lib/admin/meeting-notes/process.ts` |
| E-mail a Gmail | `lib/admin/meeting-notes/email.ts`, `lib/admin/google/gmail.ts` |
| Obrazovky | `app/dashboard/schuzky/`, `components/admin/meeting-notes/`, blok Schůzky na kartě kontaktu |
| Akce | `app/meeting-notes-actions.ts` |
| Pojistky | `send-reminders` (dokončí nezpracované), `client-retention` (retence) |
| Most z Macu | `scripts/wispr-local-most.mjs` |
| Testy | `lib/__tests__/admin-schuzky-prepisy.test.ts`, `lib/__tests__/wispr-local-most.test.ts` |

## Pravidla, která drží kód

- **Přepis se nemění.** Uloží se, jak přišel (vstup jen odstraní případné značky konektoru `<<<…>>>`), AI ho nepřepisuje.
- **Klienta z návrhu AI potvrzuje Kryštof.** Přepis je text, který mluvil klient (R-111). Sám se
  přiřadí jen jistý klient: e-mail účastníka z Wispr Flow, který má kontakt, nebo jediná událost
  v kalendáři ve stejný čas s kontaktem.
- **Údaje do kontaktu jen do prázdných polí** (R-141), e-mail a telefon jen když je nemá jiný kontakt.
- **E-mail je jen koncept v Gmailu**, adresát je e-mail přiřazeného kontaktu, ne adresa z přepisu.
  V e-mailu jsou jen dohody, kroky a otevřené body; poznámky „Jen pro vás" a přepis do něj nejdou.
- **Retence:** schůzka se maže 3 roky po konání, skrytá po roce; výmaz kontaktu vezme i jeho přepisy.
