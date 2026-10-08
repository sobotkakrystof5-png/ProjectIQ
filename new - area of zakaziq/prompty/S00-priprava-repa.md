# S00 — Příprava repa, paměti a skillů

Jsi v repu `ZakazIQ` (Next.js 14, Neon). Začínáme stavět **ZakazIQ Workspace** (SaaS pro malé
firmy) a **landing page** vedle stávající **admin konzole**, která se nesmí změnit.
`CLAUDE.md`, `AGENTS.md`, paměť `memory/` a prompty (`new - area of zakaziq/prompty/`) už jsou v repu (sloučené s přípravnou
sadou, R-013 a R-014). Skilly a plán Workspace jsou zatím jen v sadě `~/Documents/zakaziq-claude-kit/`.
Paměť z té sady (`.claude/memory/`) se **nezavádí**, platí `memory/` (R-014).

## Cíl
Repo je připravené na výstavbu: větev, dokumentace na správných místech, paměť načtená,
výchozí stav změřený. **Žádný produktový kód v tomto sezení.**

## Než začneš
Přečti `CLAUDE.md`, `AGENTS.md`, `memory/*`, ze sady `docs/workspace/PLAN.md` a skill
`zakaziq-memory`. Shrň mi v 5 větách, jak projektu rozumíš.

## Kroky
1. Založ větev `workspace` z aktuální `main`.
2. Ze sady zkopíruj `docs/workspace/PLAN.md` a `.claude/skills/zakaziq-*`. Původní `Claude.md`
   už je přejmenovaný na `AGENTS.md` (R-013), jen ověř, že v kořeni je `CLAUDE.md` velkými písmeny
   a importuje `AGENTS.md` a `memory/`.
3. Zkontroluj `.claude/skills/zakaziq-*/SKILL.md`: frontmatter je platný a skilly jsou vidět.
   Skill `zakaziq-memory` uprav tak, aby četl a zapisoval do `memory/` podle `memory/pravidla.md`
   (ne do `.claude/memory/`). Fáze S00–S19 veď v `memory/memory.md` → Aktuální stav.
   Ověř, že máš k dispozici moje uživatelské skilly ze seznamu v `new - area of zakaziq/prompty/00-README.md`;
   které chybí, vypiš.
4. Zjisti výchozí stav: `npm ci`, `npm run build`, `npm test`. Výsledky (včetně varování)
   zapiš do changelogu v `memory/memory.md`. Pokud build padá už teď, nic neopravuj, jen zapiš.
5. Doplň do `.env.example` (nemaž stávající) blok `# --- ZakazIQ Workspace ---` s prázdnými:
   `DATABASE_URL_WS`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `CLERK_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_MONTHLY`, `RESEND_API_KEY`,
   `WS_KEY_PEPPER`, `CRON_SECRET` (pokud chybí). Ke každé krátký český komentář.
6. Vytvoř prázdné složky s `README.md` (jedna věta, k čemu jsou): `app/(marketing)/`,
   `app/w/`, `components/ws/`, `components/ui/`, `lib/ws/`.
7. Projdi `memory/memory.md` → Otevřené problémy a zeptej se mě na otázky, které blokují S01–S08.

## Hotovo, když
- Větev `workspace` existuje, `docs/workspace/PLAN.md` je v repu.
- 4 skilly jsou v repu, Claude Code je vidí a `zakaziq-memory` zapisuje do `memory/`.
- Výchozí build a testy jsou zapsané v paměti.
- Žádný soubor admin konzole se nezměnil (`git diff --stat main` ukazuje jen dokumentaci,
  `.env.example`, nové složky).

## Konec sezení
Skill `zakaziq-memory`, sekce Konec sezení. Commit `chore: příprava repa pro Workspace`.
