# AD10 — Klikací kontakt, šablony zpráv a propojení kalendář ↔ hovory

## Cíl
Telefon, e-mail a SMS jsou klikací na každé obrazovce a kalendář s hovory se přestanou rozcházet.

## Než začneš
Rituál začátku. Přečti plán sekci 5 (AD10), R-010 v `memory/memory.md`.
Skilly: `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`.
Soubory: `app/calendar-actions.ts`, `app/calls-actions.ts`, `components/{LeadsTable,SmartCalendar,BookingCard,ProjectForm}.tsx`,
`components/admin/project-detail-view.tsx`, `app/dashboard/pozadavky/page.tsx`,
`lib/portfolio-email.ts` + `components/PortfolioEmailModal.tsx` (vzor šablony), `lib/utils.ts` (`whatsappHref`),
`lib/prague-time.ts`.

Dnešní stav: `tel:` je jen v `LeadsTable`, `SmartCalendar` a `BookingCard`. **Na detailu zakázky není
jediný klikací kontakt** — telefon je pouze `<input>` v `ProjectForm.tsx:264`. `/dashboard/pozadavky`
kontakt vůbec nenačítá. `sms:` se v repu nevyskytuje.

## Kroky
1. **Nový `components/admin/contact-actions.tsx`**: `tel:`, `sms:`, `mailto:`, WhatsApp přes
   `whatsappHref()`, plochy ≥ 44 px, „Zkopírovat“ jako záloha na počítači. Adresy escapuj
   (pozor na vložení parametrů do `mailto:`, R-062 to už jednou řešilo).
   Nasaď na: **detail zakázky**, **`/dashboard/pozadavky`** (změň dotaz, aby kontakt načítal),
   `LeadsTable`, `SmartCalendar`, `/dashboard/klienti`, `/dashboard/faktury/[id]`, Hub.
2. **Nový `lib/message-templates.ts`**: typované šablony
   `{ id, channel: 'sms'|'email'|'whatsapp', label, subject?, body(ctx) }`, ctx = kontakt + zakázka
   nebo lead nebo termín. Šablony **plní `href`, neposílají samy** (rozhodnutí R-084).
   Texty podle `zakaziq-ux-texty-cs`, u delších přes `humanize-text-cs`.
3. **Rozpad dvojice kalendář ↔ hovor.** Dnes změna času leadu nepřepíše `calendar_events.starts_at`.
   **Migrace 102** (jen připravit): funkce
   `admin_lead_reschedule(p_lead uuid, p_starts_at timestamptz, p_ends_at timestamptz)`, která přepíše
   čas v `client_leads` i `calendar_events` jedním příkazem (vzor `ws.money_issue`, migrace 080).
   Čas rozpadej přes `lib/prague-time.ts`, ne `AT TIME ZONE` v SQL (`calendar/page.tsx:42` to dnes porušuje).
4. **Kontakt do zrcadleného leadu.** CTE v `app/calendar-actions.ts:40-55` zakládá lead **jen
   s titulkem a popisem** — doplň `phone`, `email`, `contact_name` a `contact_id` z AD09.
5. **Rezervace z portálu do Hovorů.** Migrace 102 navíc: `consultation_slots.calendar_event_id`
   + `contact_id`; rezervace zakládá událost v téže transakci. Dotaz Hovorů rozšiř, aby čtl
   `calendar_events` podle typu (blokace a ALTENO termíny se dnes nezrcadlí vůbec).
   Zakládání událostí ke **starým** slotům musí být idempotentní.

## Hotovo, když
- Z detailu zakázky zavoláš, napíšeš SMS i e-mail bez opisování čehokoli.
- Přesun termínu v kalendáři i v hovorech dá stejný čas (test).
- Rezervace z portálu je vidět v Hovorech i v kalendáři, a ne dvakrát.
- Migrace 102 připravená (aplikována: ne).

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD10 v plánu, changelog, fakta do `AGENTS-ADMIN.md`.
Commit `admin/kontakt: volání a zprávy jedním klikem, propojení kalendáře a hovorů`.
