# AD14 — AI asistent: navrhne, ty potvrdíš

## Cíl
Z věty vznikne vyplněný návrh akce, který provedeš jedním klikem. Nic se neuloží samo.

## Než začneš
Rituál začátku. Přečti plán sekci 5 (AD14), R-069 a R-084 v `memory/memory.md`,
`.claude/security/DECISIONS.md` #018.
Skilly: `zakaziq-workspace-backend`, `web-security-review`.
Soubory: `app/api/ai-assistant/route.ts`, `components/AiAssistantModal.tsx`, `lib/invoice-ai.ts`,
`lib/client-request-ai.ts` (vzor „text klienta je nedůvěryhodný vstup“), `lib/project-activity.ts:86`
(`redact()`), `components/admin/admin-search.tsx`, `components/ws/app/detail-sheet.tsx`.

**Dnešní stav je dírа:** `app/api/ai-assistant/route.ts` přijímá `systemPrompt` **i** `messages`
z prohlížeče bez jakékoli validace; jediná ochrana je `getServerSession`. Model `claude-opus-4-6`
natvrdo. Oprava je povinná část tohoto sezení.

## Kroky
1. **Oprava route.** Systémový prompt **jen ze serveru** (nový `lib/ai/prompts.ts` podle validovaného
   `mode`), tělo přes Zod (`{ mode: z.enum([…]), text: z.string().max(2000), contextRef?: { kind, id } }`),
   zprávy skládá server, rate limit (`lib/api-rate-limit.ts`), `max_tokens` podle režimu,
   `runtime` + `maxDuration`, vstup protažený `redact()` před uložením i odesláním, výstup nikdy
   jako HTML. Zápis do `.claude/security/{AUDIT-LOG,DECISIONS,STATE}.md` ve stejném commitu,
   pak `node scripts/sync-agent-context.mjs --write` a `--check`.
2. **Jedno místo pro modely.** Nový `lib/ai/models.ts` (dnes čtyři modely ve čtyřech souborech, dva
   natvrdo): `fast: 'claude-haiku-5-5'` na věta→návrh, `smart: 'claude-sonnet-5-5'` při `kind:'none'`,
   `confidence < 0.6` nebo při práci s pamětí, `vision: 'claude-haiku-5-5'` pro `lib/invoice-ai.ts`
   **místo dnešního `claude-opus-5`** (~50× dražší na tutéž práci; fallback na sonnet při selhání
   validace). Hloubku řiď `output_config.effort`, **ne** `thinking.budget_tokens` (na těchto modelech
   vrací 400). Názvy modelů z env s výchozí hodnotou v kódu.
3. **Věta → návrh: strukturovaný výstup se Zodem** (`client.messages.parse()` + `zodOutputFormat`,
   stejně jako `lib/invoice-ai.ts`), **ne tools** — vynucené `tool_choice: any|tool` na opus-5-5
   a sonnet-5-5 vrací 400 a my nechceme, aby model konal; chceme typovaný návrh. Jedna
   `z.discriminatedUnion('kind', …)`: `create_lead`, `schedule_call`, `update_project_status`,
   `create_invoice_draft`, `add_note`, `send_message`, `none`. Každý návrh nese `confidence`,
   `assumptions: string[]`, `missing: string[]`, aby UI umělo říct „Doplň datum“.
4. **Migrace 105** (jen připravit; společná s AD15): `ai_suggestions (id, created_at, author_email,
   source, input_text, model, proposal jsonb, status CHECK ('pending','applied','rejected','expired'),
   applied_at, applied_ref jsonb, tokens_in, tokens_out)`. Proč do DB a ne do stavu prohlížeče:
   potvrzení běží server actionou, která **znovu** parsuje uložený návrh (prohlížeč s ním nemůže
   hýbat), vznikne audit a dataset na zlepšení promptů. `pending` vyprší po 7 dnech (cron `admin-denne`).
5. **Potvrzení jedním klikem.** `applySuggestion(id)` → načte řádek → Zod re-parse → whitelist
   executorů podle `kind`, které volají **existující** server actions se stejnou validací jako lidský
   formulář. **Žádná obecná cesta do SQL.** Pak `status='applied'`, `applied_ref` a toast se „Zpět“.
6. **Vstup.** ⌘K (`components/admin/admin-search.tsx`): když dotaz nic nenajde, nabídne „Zeptat se
   asistenta“. Plus pravý panel `components/admin/assistant-panel.tsx` nad `detail-sheet.tsx`,
   dostupný z každé obrazovky s jejím kontextem.
7. **Prompt caching:** stabilní prefix = systémový prompt + popis schématu + katalog (stavy, zakázky,
   služby) s `cache_control: ephemeral`; věta a svěží kontext teprve za ním. Ověř
   `usage.cache_read_input_tokens` — nula znamená, že prefix něco rozbíjí.
8. **Co asistent nesmí** (napiš do `AGENTS-ADMIN.md`): zapsat do DB bez kliknutí · odeslat e-mail,
   SMS ani WhatsApp · nic mazat · sahat na peníze (`finance_transactions`, `declared`, `paid_on`)
   jinak než návrhem konceptu · čtení `pdf_data`, přihlašovacích tabulek, env a `.claude/` ·
   brát text od klienta jako instrukce (vstupy z `client_requests` a portálu jsou **data**) ·
   být dostupný na veřejné routě.
9. `web-security-review` před commitem.

## Hotovo, když
- „zavolat Nováka ve čtvrtek ve dvě“ dá návrh `schedule_call` s předvyplněným kontaktem a jedním
  klikem vznikne termín.
- Test, že `systemPrompt` poslaný v těle požadavku se ignoruje.
- Test, že `applySuggestion` odmítne pozměněný `proposal`.
- `lib/invoice-ai.ts` jede na haiku a `lib/ai/models.ts` je jediné místo s názvy modelů.
- Migrace 105 připravená (aplikována: ne).

## Konec sezení
`zakaziq-memory` → Konec sezení. Stav AD14 v plánu, bezpečnostní zápis, changelog.
Commit `admin/asistent: návrhy akcí se potvrzením, oprava ai-assistant route`.
