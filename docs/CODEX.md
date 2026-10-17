# ZakazIQ v Codexu

Projekt používá stejnou paměť a pravidla v Claude Code i v Codexu (R-046). Aplikace ZakazIQ Workspace je část produktu pod `/w`; prostředí Codexu je pracovní prostředí pro vývoj celého repa.

## Otevření projektu

Ve VS Code s rozšířením Codex otevři kořen ZakazIQ. Pro práci v desktopovém Codexu otevři stejnou složku jako projekt. Začni na větvi `workspace`; samostatné úkoly mohou používat worktree a vlastní větev odvozenou z `workspace`. Rozpracované změny v původním checkoutu se do nového worktree nepřenášejí.

Codex čte stručný `AGENTS.md`; před prací musí podle jeho tabulky otevřít příslušné části závazné `docs/AGENTS-REFERENCE.md`. Podrobný katalog se tak nenačítá automaticky do každého sezení (R-047). Soubor `.codex/config.toml` ponechává limit projektových instrukcí 96 KiB jako rezervu. Projektová konfigurace závisí na důvěře projektu v klientovi; jestli ji klient nenačte, přečti celé instrukce ručně. Nastavení nenutí model ani nepřepisuje oprávnění.

## Příprava a příkazy

Používej Node.js 24 nebo novější a npm s `package-lock.json`.

```bash
bash scripts/codex-setup.sh --check  # ověří předpoklady bez instalace
bash scripts/codex-setup.sh          # čistá instalace závislostí pomocí npm ci
npm run dev -- --port 3001          # vývojový server
npm test                            # Vitest, Workspace DB v PGlite
npx tsc --noEmit                     # typová kontrola
npm run build:check                  # build při běžícím dev (Next 16: dev má .next/dev)
node scripts/sync-agent-context.mjs --check
```

`.codex/environments/environment.toml` obsahuje setup a akce Vývoj, Testy, Typy, Build a Kontext. Klient s podporou lokálních prostředí je může použít pro nové worktree a tlačítka akcí; v ostatních klientech spusť příkazy v terminálu. Setup instaluje závislosti, nespouští migrace ani seed a nepřenáší klíče.

Port 3001 odpovídá dosavadnímu lokálnímu vývoji projektu. Je-li obsazený, vyber jiný volný port a ověř návazné URL. `.claude/launch.json` zůstává konfigurací náhledu Claude Code; Codex používá své lokální prostředí.

## Připojení služeb

Ignorovaná `.env.local` v novém worktree chybí. Nastav potřebné vývojové proměnné podle `.env.example` a `docs/workspace/SETUP.md`; nevkládej jejich hodnoty do konfigurace Codexu ani do chatu. Setup je automaticky nekopíruje. Pro lokální přihlášení a návraty z plateb mají `NEXTAUTH_URL` a `NEXT_PUBLIC_APP_URL` odpovídat skutečnému portu, například `http://localhost:3001`.

Testy Workspace používají místní PGlite a podstrčené služby, nepotřebují připojení k Neonu. Ověření aplikace s přihlášením vyžaduje Clerk a příslušná připojení. Produkční build může potřebovat env a síť kvůli `next/font`; chybějící přístup popiš ve výsledku kontroly. Migrace a seed proti skutečné DB se pouštějí pouze podle pravidel `AGENTS.md`.

## Skills a bezpečnostní paměť

Codex má projektové skilly v `.agents/skills/` a bezpečnostní záznamy v `.agents/security/`. Jsou identické s `.claude/skills/` a `.claude/security/`; společný zdroj jsou složky `.claude/`. Po jejich změně spusť:

```bash
node scripts/sync-agent-context.mjs --write
node scripts/sync-agent-context.mjs --check
```

Skript ověřuje všechny soubory i spustitelnost, zachovává obsah a nemaže nadbytečné soubory. Pokud vzniknou dvě různé historie, nejdřív je sluč ve zdroji, pak synchronizuj. Globální skilly v `~/.agents/skills/` nejsou verzované s projektem; na jiném počítači nebo v cloudu je třeba zajistit jejich dostupnost samostatně. Stejně tak dostupnost konektorů a nástrojů závisí na klientovi; pouhá kopie skillu je nezapíná.

## Codex Cloud

Připravené skripty lze použít i při přípravě cloudového prostředí: vyber Node.js 24 a jako setup nastav `bash scripts/codex-setup.sh`. `npm ci` potřebuje síť při instalaci. Prostředí v účtu Codex Cloud a přístup k repozitáři se nastavují samostatně; samotné soubory v repu je nevytvářejí. `.codex/environments/environment.toml` popisuje lokální prostředí.

## Oficiální dokumentace

- [Projektové instrukce AGENTS.md a jejich limit](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Lokální prostředí, setup a akce](https://learn.chatgpt.com/docs/environments/local-environment)
- [Konfigurace Codexu](https://learn.chatgpt.com/docs/config-file/config-reference)
