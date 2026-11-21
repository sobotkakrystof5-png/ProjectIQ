# GDPR v klientském prostoru (KP10, R-131)

> Kde leží osobní údaje klientů VIZEONu, jak dlouho a jak vyřídit žádost o kopii nebo výmaz.
> Migrace 127, skript `scripts/portal-gdpr.mjs`, stránka pro klienta `/klient/soukromi`.
> Výklad ověřuje Kryštof (R-079); co tu není ověřené, je výslovně označené.

## Správce a zpracovatelé

Správce: Kryštof Sobotka, IČO 29977231 (VIZEON). Klient je firma (B2B); osobní údaje jsou údaje
jejích lidí, kteří do prostoru chodí, a co napíšou.

| Zpracovatel | Co | Kde | Stav smlouvy (veřejné podmínky ověřeny 2026-11-21) |
|---|---|---|---|
| Neon | databáze | eu-central-1 (Frankfurt) | DPA `neon.com/dpa` je podle jejich podmínek součástí smlouvy odkazem; zpracovatelé na `neon.com/subprocessors`. Nic se nepodepisuje, **nepotvrzeno v účtu** |
| Supabase | přihlášení (`auth.users`), soubory chatu (bucket `chat-prilohy`) | eu-central-1 | **Ověřeno 2026-11-21 v dashboardu** (Organization → Legal Documents): DPA je součástí Terms of Service, všechny organizace ho mají automaticky, podpis není potřeba; `supabase.com/legal/dpa` (SCC začleněny) |
| Vercel | provoz, logy požadavků | funkce `fra1`, CDN globálně | DPA `vercel.com/legal/dpa` platí podle podmínek pro plány Pro a Enterprise. **Ověřeno 2026-11-21 v dashboardu: tým je na plánu Hobby**, takže smlouva zpracování nepokrývá; Kryštof 2026-11-21 rozhodl Pro neplatit (R-133), **riziko vědomě přijato** |
| Resend | e-maily z vizeon.cz a zakaziq.cz | zpracování **v USA** (oblast odesílání EU určuje jen směrování, ne uložení); SCC a EU-U.S. Data Privacy Framework | DPA je podle `resend.com/security/gdpr` předpodepsané a platí pro každý účet od registrace — nic k podpisu |
| Google Workspace | Kalendář a Meet ke konzultacím | podle výchozích podmínek kdekoli, kde Google a jeho zpracovatelé působí; volba datové oblasti jen u vybraných edic | Cloud Data Processing Addendum: pokud ho smlouva neobsahuje odkazem, přijímá se v Admin konzoli (Account settings → Legal and compliance, super admin) — **přijetí neověřeno** |
| OpenAI | přepis hlasu (audio se neukládá) | USA, SCC | ověřeno 2026-11-01 (plán 8.1), přijetí DPA v organizaci **neověřeno** |
| Anthropic | shrnutí požadavků a zadání pro Claude Code | USA, SCC | ověřeno 2026-11-01 (plán 8.1) |

## Kde co leží (migrace 092–127)

| Údaj | Tabulka / místo | Retence (cron `client-retention`, R-076) | Výmaz na žádost (`portal_erase_member`) |
|---|---|---|---|
| Jméno, e-mail, id účtu člena | `portal.members` | dokud je členem | smaže řádek; skript smaže účet v Supabase |
| Přihlašovací účet | Supabase `auth.users` | — | skript přes Admin API (když není členem jinde) |
| Pozvánky (e-mail) | `portal.invites` | 90 dní po použití/zrušení/vypršení | smaže pozvánky na jeho e-mail |
| Zprávy v chatu, přepisy hlasu | `portal.messages` | 3 roky po posledním pohybu hotové zakázky | smaže jeho zprávy (nebo jen jméno autora s `--ponechat-zpravy`) |
| Přílohy | `portal.message_attachments` + Supabase Storage | se zprávou, soubor přes `storage_deletions` | se zprávou, soubor ráno cronem |
| Stav čtení vlákna | `portal.thread_state` | 3 roky (od migrace 127) | odkaz na člena se vynuluje |
| Požadavky z prostoru | `portal.requests` + kopie `client_requests` | 3 roky | smaže i kopie v adminu |
| Zadání pro Claude Code ze zpráv | `client_requests` (`admin_request_id`) | 3 roky | smaže, když maže zprávy |
| Hodnocení (staré) | `portal.feedback`, `client_feedback` | text po 3 letech | smaže |
| Dotazník R-119 | `project_surveys` (text, reference) | slovní části po 3 letech (od 127) | **nemaže** — dotazník je za firmu, ne za člena; při žádosti ručně |
| Konzultace (téma, e-mail) | `consultation_slots`, projekce `portal.consultations` | téma po 3 letech (od 127) | téma a e-mail prázdné, čas zůstává |
| Události v Google Kalendáři | Google | — | **ručně** (název a popis mohou nést jméno) |
| Úkoly „Mám hotovo" | `portal.task_marks`, `project_phase_tasks.client_done_by` | se zakázkou | smaže značky, odkaz vynuluje |
| Zprávy o práci | `project_activity`, `portal.activity` | 3 roky | — (píše Kryštof, ne člen) |
| Faktury (jméno, adresa firmy) | `invoices`, `portal.invoices` | 10 let (zákon) | **nemaže** (čl. 17 odst. 3 písm. b) |
| Poptávky z webu klienta | `project_web_events` | se zakázkou | — (žádné osobní údaje) |
| E-maily v doručených | Resend, schránka krystof@vizeon.cz | podle služby | **ručně** |

## Žádost o kopii (čl. 15)

```bash
node scripts/portal-gdpr.mjs --email jana@firma.cz --export --env .env.production.local > ~/Desktop/export-jana.json
```

JSON obsahuje člena, pozvánky, jeho zprávy (s názvy příloh), požadavky, hodnocení, konzultace
a úkoly. Soubory příloh se do exportu nekopírují; když o ně požádá, stáhnout je z adminu.
Export předat zabezpečeně a u sebe smazat. Lhůta jeden měsíc.

## Žádost o výmaz (čl. 17)

```bash
node scripts/portal-gdpr.mjs --email jana@firma.cz --vymaz --env .env.production.local
node scripts/portal-gdpr.mjs --email jana@firma.cz --vymaz --ano --env .env.production.local
```

První příkaz jen vypíše, co by se smazalo. Druhý maže ve všech prostorech, kde člen je, a smaže
i účet v Supabase (potřebuje `SUPABASE_SERVICE_ROLE_KEY`). `--ponechat-zpravy` nechá text zpráv
firmě a zahodí jméno autora — použít, když firma potřebuje historii domluv (oprávněný zájem,
čl. 17 odst. 3 písm. e) a člen s tím souhlasí. Ručně pak: události v Google Kalendáři,
korespondence ve schránce, případně kontakt v adminu (výmaz kontaktu v adminu zatím chybí —
Otevřené problémy). Vyřízení zapsat (datum, rozsah) bez osobních údajů.

## Odebraný člen

Odebrání v adminu (`removeMember`) jen zavře přístup (`removed_at`); účet v Supabase a jeho zprávy
zůstávají. Když odebraný člen požádá o výmaz, pustit skript výše.
