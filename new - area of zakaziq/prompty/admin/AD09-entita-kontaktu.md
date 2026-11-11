# AD09 — Jedna entita kontaktu

## Cíl
Jeden člověk = jeden řádek. Telefony a e-maily rozkopírované v osmi tabulkách se dají spojit.

## Než začneš
Rituál začátku. Přečti plán sekci 5 (AD09) a `docs/admin/AGENTS-ADMIN.md` → Katalog tabulek.
Skilly: `zakaziq-workspace-backend`, `web-security-review`.
Soubory: `migrations/`, `app/actions.ts` (`convertLeadToProject` je v `app/calls-actions.ts:162`),
`components/ProjectForm.tsx`, `components/LeadsTable.tsx`, `lib/types.ts`, `scripts/ws-seed.mjs` (vzor skriptu).

Dnešní stav: kontakt je v `client_leads`, `projects`, `consultation_slots`, `completed_projects`,
`agent_leads`, `portal.members`, `portal.invites`, `ws.customers` — bez unique, bez indexu, bez
normalizace. Shodu člověka nelze zjistit. Jen `ws.customers` má CHECK na E.164.

## Kroky
1. **Migrace 101** (jen připravit): tabulka `contacts` (`display_name`, `company`, `email`,
   `phone` s CHECK na E.164, `ico`, `dic`, `note`, `source`, `last_seen_at`, `created_at`, `updated_at`,
   `merged_into REFERENCES contacts(id)`), **částečné** unique indexy na `lower(email)` a `phone`
   s `WHERE merged_into IS NULL`, GIN trgm na jméno, a `contact_id uuid REFERENCES contacts(id)
   ON DELETE SET NULL` na `client_leads`, `projects`, `consultation_slots`, `completed_projects`,
   `agent_leads` + index na každém. Částečné unique indexy jsou záměr: duplicita nikdy nesmí
   zablokovat zápis z formuláře, kolize se řeší v UI.
2. **Normalizace.** Nový `lib/contacts/normalize.ts`: `normalizePhone(raw, '+420')` → E.164 (řeší
   `00420`, `0042`, mezery, vedoucí nulu, klapku), `normalizeEmail` → trim + lower. Čisté funkce
   s unit testy, vzor je CHECK na `ws.customers` (migrace 067).
3. **Co zůstane kopií.** Textové sloupce (`projects.client_*`, `invoices.client_*`) zůstávají jako
   **snímek dokladu**. Pravidlo do `AGENTS-ADMIN.md`: `contact_id` = kdo to je, text = co bylo tehdy napsáno.
4. **Backfill není v migraci** (masový zápis). Nový `scripts/admin-contacts-backfill.mjs`: dry-run
   výchozí, `--ano` zapisuje, seskupí podle normalizovaného telefonu, pak e-mailu, vytvoří kontakty,
   doplní `contact_id`, vypíše konflikty. Co je sporné, **zůstane nepřiřazené** a objeví se v UI.
   Pouštíš ho na testovací DB; na produkci ho pustí Kryštof.
5. **Sloučení v UI.** `/dashboard/kontakty` nad `data-table` z AD07 + detail s „Objevuje se také jako…“
   a tlačítkem **Sloučit**: nastaví `merged_into` a přesměruje `contact_id`; **Zpět = smazat
   `merged_into`** (nic se nemazalo, takže sloučení nepotřebuje zálohu). Nikdy automaticky.
6. `convertLeadToProject` předá `contact_id` místo kopie textu.
7. `web-security-review` na nové vstupy a dotazy.

## Hotovo, když
- Dry-run backfillu nad testovacími daty vypíše počet kontaktů a konfliktů.
- Dva leady se stejným telefonem v jiném zápisu (`+420 777 123 456` / `0777123456`) ukazují jeden kontakt.
- Sloučení i jeho Zpět mají test; duplicitní kontakt nikdy nezablokuje uložení formuláře.
- Migrace 101 připravená (aplikována: ne).

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD09 v plánu, migrace a nová tabulka do `AGENTS-ADMIN.md`.
Commit `admin/kontakty: jedna entita kontaktu a sloučení duplicit`.
